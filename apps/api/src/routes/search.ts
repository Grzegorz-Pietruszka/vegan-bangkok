import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { searchQuery, searchResponse, placeSearchQuery, placeSearchResponse } from '@vegan-bangkok/schemas';
import { MODEL } from '../embed/gemini.ts';
import { searchByVector, searchSimilar, searchByName, searchByAlias, searchFullText } from '../search/dishSearch.ts';
import { getCachedEmbedding, putCachedEmbedding } from '../search/embeddingCache.ts';
import { parsePlaceQuery, classifyIntentSLM } from '../search/placeParser.ts';
import {
  findEntityMatches, resolveGeo, geoArm, lexicalArm, vectorArm, hydratePlaces, fallbackQuery,
} from '../search/placeRetrieval.ts';
import { rrfFuse } from '../search/fusion.ts';
import { rankPlaces, type RankCandidate } from '../search/placeRanking.ts';
import { NEAR_ME_RADIUS_M } from '../search/constants.ts';

type Opts = { embedFn: (texts: string[]) => Promise<number[][]> };

// Typed as FastifyPluginAsyncZod so the ZodTypeProvider flows in: `req.body` is
// SearchQuery and `req.params` is { id: string } (not `unknown`) — keeps `tsc --noEmit` clean.
export const searchRoutes: FastifyPluginAsyncZod<Opts> = async (app, opts) => {
  app.post('/search', { schema: { body: searchQuery, response: { 200: searchResponse } } },
    async (req, reply) => {
      const { q, limit, tags } = req.body;

      // ── Tier 1: full-name gate — cheap, deterministic, no Gemini ──
      const named = await searchByName(q);
      if (named.length > 0) {
        return { results: named.slice(0, limit), matchType: 'name' as const };
      }

      // ── Tier 1.5: alias gate — transliterations/product aliases, still no Gemini ──
      const aliased = await searchByAlias(q);
      if (aliased.length > 0) {
        return { results: aliased.slice(0, limit), matchType: 'alias' as const };
      }

      // ── Tier 2: semantic vector (cache in front of the paid embed) ──
      try {
        let vec = await getCachedEmbedding(q, MODEL);
        if (!vec) {
          [vec] = await opts.embedFn([q]);            // throws if Gemini is down → Tier 3
          await putCachedEmbedding(q, MODEL, vec);
        }
        const results = await searchByVector(vec, { limit, tags });
        return { results, matchType: 'semantic' as const };
      } catch (err) {
        // ── Tier 3: degraded SQL full-text — keep answering, never 5xx on Gemini failure ──
        req.log.warn({ err }, 'vector search unavailable — falling back to full-text');
        const results = await searchFullText(q, { limit });
        reply.header('x-search-degraded', '1');
        return { results, matchType: 'keyword' as const };
      }
    });

  // Place search (spec 2026-07-27): parse → retrieve (3 arms) → RRF → intent-weighted
  // rank → respond. Hard vegan filter lives in hardFilterClause — every arm and the
  // fallback compose it. SLM-unavailable low confidence or zero results → popularity fallback, never empty.
  app.post('/search/places', { schema: { body: placeSearchQuery, response: { 200: placeSearchResponse } } },
    async (req, reply) => {
      const { q, lat, lng, limit } = req.body;
      const hasUserLoc = lat != null && lng != null;

      const entities = await findEntityMatches(q);
      let intent = parsePlaceQuery(q, { hasUserLoc, knownEntities: entities });
      let geo = resolveGeo(intent, hasUserLoc ? { lat, lng } : undefined);

      const respondFallback = async (reason: 'low_confidence' | 'no_results') => {
        const fell = await fallbackQuery(intent, geo, limit);
        const results = await hydratePlaces(fell, geo);
        return { results, intent, fallback: true as const, fallbackReason: reason };
      };

      try {
        intent = await classifyIntentSLM(q, intent, { hasUserLoc });
        geo = resolveGeo(intent, hasUserLoc ? { lat, lng } : undefined);
      } catch (err) {
        // SLM not ready or failed on a low-confidence query — slice-1 behavior, unchanged contract.
        req.log.warn({ err }, 'place search: SLM unavailable — low-confidence fallback');
        return respondFallback('low_confidence');
      }

      const arm = async (name: string, run: () => Promise<{ id: string; score: number }[]>) => {
        try {
          return await run();
        } catch (err) {
          req.log.warn({ err }, `place search: ${name} arm failed — skipped`);
          if (name === 'vector') reply.header('x-search-degraded', '1');
          return [];
        }
      };
      const [geoRes, lexRes, vecRes] = await Promise.all([
        geo ? arm('geo', () => geoArm(intent, geo)) : Promise.resolve([]),
        arm('lexical', () => lexicalArm(intent)),
        intent.semanticQuery ? arm('vector', () => vectorArm(intent, opts.embedFn)) : Promise.resolve([]),
      ]);

      const fused = rrfFuse([geoRes, lexRes, vecRes].filter((a) => a.length > 0)).slice(0, 50);
      let hydrated = await hydratePlaces(fused, geo);
      // Geo-scoped query: lexical/vector arms search citywide — drop candidates beyond
      // the resolved radius ("near me" must not answer with the other side of town).
      if (geo) hydrated = hydrated.filter((h) => h.distanceM == null || h.distanceM <= geo.radiusM);
      if (hydrated.length === 0) return respondFallback('no_results');

      const rrfById = new Map(fused.map((f) => [f.id, f.score]));
      const cands: RankCandidate[] = hydrated.map((h) => ({
        id: h.id, rrf: rrfById.get(h.id) ?? 0, distanceM: h.distanceM,
        lovedCount: h.lovedCount, vibeTags: h.vibeTags,
      }));
      const ranked = rankPlaces(cands, intent, geo?.radiusM ?? NEAR_ME_RADIUS_M).slice(0, limit);
      const byId = new Map(hydrated.map((h) => [h.id, h]));
      const results = ranked.map((r) => ({ ...byId.get(r.id)!, score: r.score }));
      return { results, intent, fallback: false as const };
    });

  app.get('/dishes/:id/similar', {
    schema: { params: z.object({ id: z.uuid() }), response: { 200: searchResponse } },
  }, async (req) => {
    const results = await searchSimilar(req.params.id, { limit: 10 });
    return { results, matchType: 'semantic' as const };
  });
};
