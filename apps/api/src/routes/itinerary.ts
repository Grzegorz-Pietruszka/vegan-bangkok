import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { itineraryRequest, itineraryResponse, type RouteStep } from '@vegan-bangkok/schemas';
import { db } from '../db/index.ts';
import { MODEL } from '../embed/gemini.ts';
import { getCachedEmbedding, putCachedEmbedding } from '../search/embeddingCache.ts';
import { findPreset } from '../itinerary/presets.ts';
import { buildShortlist, type Candidate, type ShortlistIntent } from '../itinerary/shortlist.ts';
import { buildCostMatrix, haversineM } from '../itinerary/matrix.ts';
import { orderRoute } from '../itinerary/route.ts';
import { narrate, type NarrateFn } from '../itinerary/narrative.ts';

type Opts = {
  embedFn: (texts: string[]) => Promise<number[][]>;
  narrateFn?: NarrateFn;
};

// v1 EASY slot heuristic: sights in daylight first, sunset-tagged stops at golden hour,
// night-vibe stops last; everything else unconstrained. Coarse by decision (plan 10).
export function slotRank(c: Candidate): number | null {
  if (c.vibeTags.includes('sunset')) return 1;
  if (c.vibeTags.includes('late-night') || c.vibeTags.includes('night-market')) return 2;
  if (c.type === 'site') return 0;
  return null;
}

export const itineraryRoutes: FastifyPluginAsyncZod<Opts> = async (app, opts) => {
  app.post('/itinerary', { schema: { body: itineraryRequest, response: { 200: itineraryResponse } } },
    async (req) => {
      const body = req.body;
      const preset = body.presetId ? findPreset(body.presetId) : undefined;

      const intent: ShortlistIntent = {
        start: body.start,
        text: body.text,
        vibeTags: preset?.vibeTags ?? [],
        radiusM: body.radiusM ?? preset?.defaults.radiusM ?? 2500,
        timeOfDay: body.timeOfDay ?? preset?.defaults.timeOfDay,
        priceBandMax: body.priceBandMax,
        spiceMax: body.spiceMax,
        anchors: {
          placeIds: body.anchors?.placeIds ?? [],
          siteIds: body.anchors?.siteIds ?? [],
          dishIds: body.anchors?.dishIds ?? [],
        },
      };
      const maxStops = body.maxStops ?? preset?.defaults.maxStops ?? 5;

      // Query embedding goes through the durable cache — one paid call per distinct query.
      const embedViaCache = async (text: string): Promise<number[]> => {
        let vec = await getCachedEmbedding(text, MODEL);
        if (!vec) {
          [vec] = await opts.embedFn([text]);
          await putCachedEmbedding(text, MODEL, vec);
        }
        return vec;
      };

      const { candidates, degraded: embedDegraded } = await buildShortlist(intent, { db, embed: embedViaCache });
      if (embedDegraded) req.log.warn('itinerary embed degraded — vibe/geo ranking only');
      if (candidates.length === 0) {
        return { steps: [], narrative: null, reason: 'no candidates within radius' };
      }

      const anchorIdx = candidates.flatMap((c, i) => (c.anchor ? [i + 1] : []));   // +1: node 0 = start
      if (anchorIdx.length > maxStops) {
        throw Object.assign(new Error(`anchors (${anchorIdx.length}) exceed maxStops (${maxStops})`), { statusCode: 400 });
      }

      // Food is central — this is a vegan-food app, not a sightseeing app. Guarantee at least
      // one food stop (place/dish) so a sight-dense area can't yield a sights-only walk.
      // Skip if an anchor is already food, or if anchors already fill every slot.
      const isFood = (c: Candidate) => c.type !== 'site';
      const mustInclude = [...anchorIdx];
      if (!anchorIdx.some((idx) => isFood(candidates[idx - 1])) && mustInclude.length < maxStops) {
        let bestFood = -1; let bestScore = -Infinity;
        candidates.forEach((c, i) => {
          if (isFood(c) && c.score > bestScore) { bestScore = c.score; bestFood = i + 1; }
        });
        if (bestFood !== -1) mustInclude.push(bestFood);
      }

      const nodes = [{ ...body.start, vibeScore: 0 }, ...candidates];
      const matrix = buildCostMatrix(nodes);
      const order = orderRoute(matrix, {
        startIdx: 0,
        mustInclude,
        slotRanks: [null, ...candidates.map(slotRank)],
        maxStops,
      });

      const steps: RouteStep[] = order.slice(1).map((nodeIdx, i) => {
        const c = candidates[nodeIdx - 1];
        const prev = nodes[order[i]];    // order[i] is the node BEFORE order[i+1]
        return {
          type: c.type, id: c.id, name: c.name, nameTh: c.nameTh,
          lat: c.lat, lng: c.lng, order: i, summary: c.summary,
          walkMetersFromPrev: Math.round(haversineM(prev, c)),
        };
      });

      const n = await narrate(steps, { text: body.text, presetLabel: preset?.label },
        opts.narrateFn ? { generate: opts.narrateFn } : {});
      return {
        steps,
        narrative: n.text || null,
        ...(embedDegraded ? { degraded: 'embed' as const }
          : n.degraded ? { degraded: 'narrative' as const } : {}),
      };
    });
};
