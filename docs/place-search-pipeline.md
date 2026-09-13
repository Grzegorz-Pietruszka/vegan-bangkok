# Place Search Pipeline

**Date:** 2026-07-27
**Endpoint:** `POST /search/places`
**Status:** Slices 1 and 2 merged to `main`. Slice 3 (semantic cache) not yet built.
**Specs:** `docs/superpowers/specs/2026-07-27-place-search-pipeline-design.md` (slice 1), `docs/superpowers/specs/2026-07-27-place-search-slm-design.md` (slice 2)

Everything documented here was built and merged on 2026-07-27, in two slices:

- **Slice 1 — deterministic core** (commits `7432093`..`9b19d67`): the SearchIntent contract, a rule-based query parser with confidence scoring, hybrid three-arm retrieval (geo / lexical / vector) behind a hard vegan filter, reciprocal rank fusion, intent-weighted ranking, safe fallbacks, and the PostGIS/tsvector database columns that power it.
- **Slice 2 — SLM intent classification** (commits `341e71a`..`d682207`): an in-process zero-shot language model that classifies low-confidence queries, replacing slice 1's "give up and show popular places" short-circuit with real retrieval.

## Why this exists

The app needs one search box that handles everything from *"best vegan restaurant in Thonglor"* to *"somewhere chill to grab dinner tonight"*. The design principle is **deterministic first**: rules handle what rules can handle (cheaply, predictably, testably), and a small ML model is consulted only when the rules admit they don't understand the query. No stage ever compromises the vegan guarantee, and the endpoint never returns an empty list or a 5xx because a dependency (Gemini embeddings, the SLM) is down.

## Request flow

```
POST /search/places  { q, lat?, lng?, limit }
  │
  ├─ 1. findEntityMatches(q)          dish/alias n-gram lookup (DB)
  ├─ 2. parsePlaceQuery(q, …)         deterministic parse → PlaceSearchIntent + confidence
  ├─ 3. classifyIntentSLM(q, intent)  confidence ≥ 0.7 → no-op; else zero-shot SLM
  │       └─ SLM unavailable → popularity fallback (fallbackReason: low_confidence)
  ├─ 4. resolveGeo(intent, userLoc)   district centroid+radius, or user location for "nearby"
  ├─ 5. retrieval arms (parallel)     geoArm | lexicalArm | vectorArm — each hard-filtered
  ├─ 6. rrfFuse(arms)                 reciprocal rank fusion, top 50
  ├─ 7. hydratePlaces + radius trim   one query for display columns; geo-scoped queries
  │                                    drop candidates beyond the resolved radius
  │       └─ zero rows → popularity fallback (fallbackReason: no_results)
  ├─ 8. rankPlaces(…)                 intent-weighted scoring, top `limit`
  └─ 9. respond                       { results, intent, fallback: false }
```

## The contract — `PlaceSearchIntent` (`packages/schemas/src/domain.ts`)

Every stage communicates through one Zod-validated object:

```ts
{
  intentType: 'entity' | 'discovery' | 'planning' | 'best' | 'nearby',
  entities: string[],                  // recognized dish/venue names
  primaryLocation: string | null,      // canonical district name
  isBestQuery: boolean,
  mode: 'popular' | 'hidden_gems' | null,
  hardFilters: {
    vegan: true,                       // z.literal(true) — cannot be constructed false
    openNow: boolean,
    priceMax: 1|2|3|4 | null,
    exclude: string[],                 // reserved for allergens (later slice)
  },
  softPreferences: string[],           // ⊆ VIBE_VOCAB — ranking signal, never a filter
  semanticQuery: string,               // cleaned text for the vector arm
  confidence: number,                  // 0..1, fraction of query tokens understood
}
```

Two deliberate type-level guarantees: `hardFilters.vegan` is `z.literal(true)`, so an intent with vegan filtering disabled is unrepresentable; and soft preferences are structurally separate from hard filters, so a vibe word can never accidentally exclude results. The response echoes the full intent back to the client for UX and debugging.

## Stage details

### Deterministic parser (`apps/api/src/search/placeParser.ts`)

Pure and synchronous — entity knowledge arrives pre-resolved via `opts.knownEntities` (the route calls `findEntityMatches` first), so the parser is trivially table-testable. Three passes:

1. **Phrase patterns** on the raw lowercased query (`INTENT_PATTERNS` in `constants.ts`): planning ("food crawl", "itinerary"), hidden gems ("hole in the wall", "no tourists"), popular, best, nearby ("near me", "walking distance" — only honored when the request carries coordinates), cheap (caps `priceMax` at price band 2), open-now. Matched spans are removed both from the token stream (so they count as "understood") and from `semanticQuery` (intent words don't help the vector arm).
2. **N-gram resolution** (longest-first, 3→2→1 tokens) over what remains: district aliases (`DISTRICTS` — 15 Bangkok districts with English variants, Thai script, centroid, and radius; e.g. "yaowarat" → Chinatown), known dish entities, vibe vocabulary words (→ `softPreferences`), venue words ("cafe", "buffet" → entities), and stop words.
3. **Intent resolution**, precedence: planning > best > nearby > entity > discovery.

**Confidence** is the fraction of query tokens the parser consumed. *"best vegan restaurant in Thonglor"* consumes everything → 1.0. Gibberish or conversational phrasing consumes little → below the 0.7 threshold, which is what triggers the SLM.

### SLM classification (`apps/api/src/search/slmClassifier.ts`, slice 2)

For low-confidence queries only, a zero-shot NLI model — `Xenova/nli-deberta-v3-xsmall` (quantized ONNX, ~70 MB; measured 243 ms p50 / 385 ms p95 per query on CPU, M2 Pro — see `docs/place-search-article.md`) — runs **inside the API process** via Transformers.js. No network call at inference time, no new service.

Zero-shot means the model was never trained on our labels. For each candidate label it scores the hypothesis *"This restaurant search query is about {label}."* against the query; the top label wins and maps through a fixed table:

| Label phrasing | intentType | mode |
|---|---|---|
| looking for a specific named restaurant or dish | `entity` | – |
| a relaxed casual place to eat, no particular criteria | `discovery` | – |
| planning a multi-stop food tour or itinerary | `planning` | – |
| top rated or highly rated restaurants | `best` | – |
| places within walking distance of my current gps location | `nearby` | – |
| famous popular restaurants that many people visit | `discovery` | `popular` |
| secret hidden gems that few tourists know about | `discovery` | `hidden_gems` |

The phrasings are implementation detail, tuned against the real model until the canonical test queries classified correctly; the label→field structure is the contract.

**Lazy singleton loading.** The model is not loaded at startup. The first low-confidence query triggers a background load (~1–3 s warm-up plus a one-time ~70 MB download to the Transformers.js cache). `classifyIntent` never awaits the load — while loading it throws `SlmNotReadyError` immediately, so warm-up requests fall back instead of hanging. `loading ??=` guarantees exactly one load under concurrency; a failed load surfaces once as `SlmError` and resets so the next query retries. Once resident (~150–250 MB RAM) it serves all subsequent queries in-process.

**Hard boundaries**, enforced by tests:

- The classifier writes **only** `intentType` and `mode`. `hardFilters`, `primaryLocation`, `entities`, `softPreferences`, `semanticQuery`, and `confidence` are byte-identical before and after — the vegan guarantee and all rule-owned extraction are structurally out of the SLM's reach.
- High-confidence queries never touch the SLM (verified with a fake pipeline that throws if invoked).
- A `nearby` classification without user coordinates downgrades to `discovery`.
- On `SlmNotReadyError`/`SlmError` the route returns the exact slice-1 fallback response (`fallback: true, fallbackReason: 'low_confidence'`) — the client contract did not change; that reason now means "vague query **and** classifier unavailable".
- The `x-search-degraded` header remains vector-arm-only; SLM state is never surfaced in headers.

### Geo resolution and retrieval arms (`apps/api/src/search/placeRetrieval.ts`)

`resolveGeo` produces a search circle: the matched district's centroid and radius when the query named one, else the user's location with a 2 km radius for `nearby` intents, else null (citywide). Because SLM classification can change the intent (e.g. upgrade it to `nearby`), the route re-resolves geo after classification.

Three arms run in parallel, each returning `(id, score)` rows capped at 50, each independently fault-isolated (an arm that throws is logged and skipped; a vector-arm failure additionally sets the `x-search-degraded` response header):

- **Geo arm** — PostGIS `ST_DWithin` within the circle, KNN-ordered by the `<->` distance operator; score is linear distance decay.
- **Lexical arm** — Postgres full-text (`websearch_to_tsquery` against the generated `search_tsv` column) combined with a normalized-name substring match, scored via `ts_rank` with a floor for substring-only hits.
- **Vector arm** — embeds `semanticQuery` (Gemini, behind the shared embedding cache so repeat queries cost nothing), then pgvector cosine KNN over `places.embedding`. Skipped entirely when `semanticQuery` is empty.

**The hard filter lives in exactly one place.** `hardFilterClause()` builds the vegan-status / price-band / open-now WHERE fragment, and every arm *and* the fallback compose it. Vegan status (`fully_vegan`, `vegetarian_jay`, `vegan_friendly`) is unconditional. Open-now evaluates the place's JSONB opening hours against current Bangkok wall-clock time.

### Fusion (`apps/api/src/search/fusion.ts`)

Reciprocal Rank Fusion: each arm contributes `1 / (60 + rank)` per place, summed across arms. Rank-based fusion is the point — `ts_rank` scores, cosine similarities, and metre distances are incomparable scales, and RRF fuses them without any normalization. A place surfaced by multiple arms accumulates score, which is exactly the "independently corroborated" signal wanted.

### Hydration and radius trim

One SQL query fetches display columns, summed `loved_count` across the place's dishes, and (when geo is active) the real distance. Geo-scoped queries then drop any candidate beyond the resolved radius — the lexical and vector arms search citywide, and "near me" must not answer with the other side of town.

### Ranking (`apps/api/src/search/placeRanking.ts`)

Final score is a weighted sum of four normalized signals — relevance (RRF score / max), distance (linear decay within the radius), popularity (log-scaled loved count / max), and vibe (overlap between the place's `vibe_tags` and the query's `softPreferences`) — with weights chosen by intent (`RANK_WEIGHTS` in `constants.ts`):

| Intent | relevance | distance | popularity | vibe |
|---|---|---|---|---|
| entity | 0.6 | 0.2 | 0.1 | 0.1 |
| nearby | 0.3 | 0.5 | 0.1 | 0.1 |
| best / mode=popular | 0.3 | 0.1 | 0.5 | 0.1 |
| discovery / planning | 0.3 | 0.1 | 0.2 | 0.4 |
| mode=hidden_gems | 0.3 | 0.1 | **−0.2** | 0.4 |

The hidden-gems mechanism is that negative popularity weight: well-loved tourist magnets are actively pushed down. The numbers are declared starting points to be tuned via an eval harness; the structure is the contract.

### Fallbacks — the endpoint never returns empty

`fallbackQuery` ignores everything except the hard filters and geography (radius doubled when geo is present, citywide otherwise) and returns places by log-scaled popularity. It fires in exactly two cases:

- `low_confidence` — vague query and the SLM was unavailable (loading, or failed).
- `no_results` — the full pipeline ran and produced zero candidates after the radius trim.

The response carries `fallback: true` plus the reason, so the client can render "showing popular vegan places nearby instead".

## Database changes (migration 0007, commit `46775c2`)

Two **generated** columns on `places`, deliberately unmapped in the Drizzle schema so the ORM can never write them (raw SQL only):

- `geog geography(Point, 4326)` — generated from lat/lng, GiST-indexed, powers `ST_DWithin` and KNN ordering.
- `search_tsv tsvector` — generated from the name/description text, GIN-indexed, powers the lexical arm.

This required swapping the local Postgres image to a pgvector + PostGIS build (`apps/api/db.Dockerfile`; dev container `vb-postgres` on :55432, test container `vb-pg` on :5433). Production note recorded in `infrastructure-design/infrastructure.md`: Railway must run an image with both extensions.

## Testing

The apps/api suite stands at 225 tests plus one gated skip, all green, with `tsc --noEmit` clean and `packages/schemas` at 23/23.

- **Parser** — table-driven cases for pattern/district/entity/vibe extraction, confidence scoring, and the slice-2 additions: high-confidence SLM bypass, field immutability (destructure `intentType`/`mode` out, deep-equal the rest), nearby-without-location downgrade.
- **Classifier unit tests** — fake pipelines assert the label→field mapping, typed errors on failure, and that the not-ready path throws in milliseconds without starting a download.
- **Route integration tests** (real test DB) — district query, near-me with coordinates and distance ordering, embedder-down degradation, and the slice-2 trio: garbage query + working fake SLM → `fallback: false` with real results; garbage query + throwing fake → exact slice-1 fallback; high-confidence query + booby-trapped fake → succeeds, proving the SLM was never invoked.
- **Real-model test** (`test/slmIntegration.test.ts`) — gated behind `SLM_TEST=1` and skipped in `npm test`/CI. Downloads and loads the actual ONNX model, polls through warm-up, and asserts canonical queries classify correctly (*"somewhere chill to grab dinner tonight"* → discovery; *"top rated brunch spots"* → best; *"secret local places tourists dont know"* → discovery + hidden_gems). Ran and passed on 2026-07-27.

`npm test` is guaranteed never to download the model by two mechanisms: the loader refuses to start under `NODE_ENV=test` (unless `SLM_TEST=1` opts in), and `NODE_ENV=test` is hard-coded into the apps/api test script so the gate survives a fresh clone without the gitignored `.env.test`.

## Deployment notes and accepted trade-offs

- **English-only model** — deliberate. Thai queries still answer through the deterministic path (district aliases include Thai script); revisit if evals show need.
- **Railway's ephemeral filesystem** — each deploy's first low-confidence query re-downloads the ~70 MB model. Accepted for now; baking the model into the Docker image is the known fix, and would also cover the current lack of backoff when the model host is unreachable.
- **Memory** — ~150–250 MB resident once the model loads; single-replica deployment, so no cross-instance coordination.
- **District list is curated** — 15 districts hand-maintained in `constants.ts`, with a test asserting coverage against the seed data.

## Known follow-ups (non-blocking, from merge review)

- Unit tests cover 4 of 7 SLM labels; `entity`, plain `discovery`, `best`, and the unknown-label error path lack direct cases.
- A place-search eval set is wanted before further label tuning — "top rated brunch spots" won `best` over `popular` by a thin margin (0.43 vs 0.38).
- No backoff on model-load retry; a permanently failing host re-attempts the download on alternating queries.
- Route test seeds `places.embedding` locally in its own fixture; other test files may share the latent gap.
- Cosmetics: SLM error subclasses don't set `this.name`; `@huggingface/transformers` pulls a duplicate `sharp` tree.

## What comes next

**Slice 3 — semantic cache**: cache keyed on the SearchIntent JSON (not raw query text), with tag-based invalidation and TTL. The existing embedding cache already covers the paid Gemini call, so slice 3 targets retrieval results. Not yet specced.
