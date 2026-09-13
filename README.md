# Vegan Bangkok

A curated, dish-first vegan guide to Bangkok. Not a listings directory — closer to a picky local
friend who tells you *what* to order, *how* to order it without accidentally getting fish sauce,
and where to go next.

Three things a directory doesn't do:

- **A per-dish ordering and trust layer** — Thai phrases to say out loud, hidden-ingredient
  warnings, verified confidence tiers.
- **Intent-based discovery** — one search box that handles `best vegan restaurant in Thonglor`,
  `somewhere chill for dinner tonight`, and `broccoli revolution` without treating them alike.
- **Offline-first behaviour** — the curated catalog ships in the app bundle, so a cold boot with
  no signal still renders the guide.

v1 is deliberately anonymous: no accounts, no user table. The passport and saved places live on
the device.

---

## The interesting part: rules first, model second

`POST /search/places` is the piece worth reading. It runs deterministic rules first and only
reaches for a model when the rules admit they failed:

```
query → deterministic parser → (low confidence?) → in-process SLM
      → geo + lexical + vector arms → RRF fusion → hydrate → radius trim → rank
```

Two guarantees hold regardless of which path a query takes:

1. **Never surface a place that isn't vegan-safe.** The filter lives in SQL and in the types, not
   in a prompt.
2. **Never return an empty list or a 5xx**, even when the embeddings API or the model is down.
   Every arm degrades independently.

The classifier is `Xenova/nli-deberta-v3-xsmall` — a quantized ONNX zero-shot NLI model (~70 MB)
running **inside the API process** via Transformers.js. No inference-time network call, no extra
service, no external LLM anywhere in the search path.

Measured locally over a 32-query eval set against 144 places (`npm run eval:places -w
@vegan-bangkok/api`, reports committed under `apps/api/eval/`):

| | rules only | rules + SLM |
|---|---|---|
| Retrieval queries answered correctly | 0 / 7 | **7 / 7** |
| Fallback rate | 56% | **3%** |
| Vegan-guarantee violations | 0 | 0 |
| SLM inference | — | 243 ms p50 / 385 ms p95 |

The SLM earns its ~240 ms on exactly the queries the parser can't read, and never runs on the
ones it can.

📝 **[I built a search pipeline that knows when it doesn't understand you](https://dev.to/grzegorzpietrus/i-built-a-search-pipeline-that-knows-when-it-doesnt-understand-you-58p2)**
— the design decisions, the numbers, and the parts that are still half-broken.
Architecture reference: [`docs/place-search-pipeline.md`](docs/place-search-pipeline.md).

---

## Layout

npm workspaces monorepo.

| Path | What | Stack |
|------|------|-------|
| `apps/mobile` | The app | Expo SDK 57 / React Native, expo-router, Mapbox |
| `apps/api` | Backend | Fastify 5, Zod, Drizzle, Transformers.js |
| `apps/admin` | Content curation admin | Next.js |
| `ocr-service` | Thai OCR sidecar | Python, PaddleOCR |
| `packages/schemas` | Shared Zod schemas and domain types | — |
| `packages/db` | Drizzle schema + client | PostgreSQL + pgvector |

One Postgres does all the retrieval work — PostGIS for geo, full-text for lexical, pgvector for
semantic. No separate vector database, no Redis. Embeddings come from Gemini and are cached in
the database.

### API surface

| Route | Purpose |
|---|---|
| `POST /search/places` | Hybrid place search (the pipeline above) |
| `POST /search` | Dish search |
| `POST /chat` | Craving chat, answered by a local Ollama sidecar |
| `POST /itinerary` | Day/walk planning over the catalog |
| `POST /scan-menu` | Photograph a Thai menu; OCR + ingredient matching |

Menu scanning uses the Python PaddleOCR sidecar when `OCR_URL` is set, and falls back to an
in-process Tesseract.js path when it isn't. Chat degrades to a non-LLM answer when `OLLAMA_URL`
is absent — the API boots either way.

---

## Prerequisites

- Node **>= 24** — the API runs `.ts` directly via Node's type stripping, so there is no build step
- Docker, for local Postgres with pgvector
- `GEMINI_API_KEY` for embeddings (tests don't need a real one)
- Optional: Python 3.12 for the OCR sidecar, Ollama for craving chat

## Quick start

```sh
npm ci

# shared packages build first — the apps import their dist/
npm run build -w @vegan-bangkok/schemas -w @vegan-bangkok/db

# local Postgres: a pgvector image on port 55432
# then create apps/api/.env with DATABASE_URL + GEMINI_API_KEY
npm run db:migrate -w @vegan-bangkok/api
npm run seed       -w @vegan-bangkok/api

# run what you need
npm run dev   -w @vegan-bangkok/api     # Fastify — GET /health to check
npm run start -w mobile                 # Expo
npm run dev   -w @vegan-bangkok/admin   # Next.js on :3100
```

Per-app env keys are documented in each app's `.env.example`.

### Mobile config

`apps/mobile/app.json` ships with empty credentials on purpose. Put your own in a gitignored
`apps/mobile/.env.local`:

```sh
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000   # so a physical device can reach the API
EXPO_PUBLIC_MAPBOX_TOKEN=pk.<your-public-token>
```

Both fall back sensibly — `API_BASE` to `http://localhost:3000`, and the map throws a clear
`Missing Mapbox public token` rather than failing silently.

### OCR sidecar (optional)

```sh
cd ocr-service
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python server.py        # http://127.0.0.1:8091
```

Then set `OCR_URL=http://127.0.0.1:8091/ocr` in `apps/api/.env`.

## Tests

```sh
npm test -w @vegan-bangkok/api    # needs a migrated test DB: npm run db:migrate:test
npm test -w mobile
npm test -w @vegan-bangkok/admin -w @vegan-bangkok/schemas -w @vegan-bangkok/db
```

The real-model SLM integration test is gated behind an explicit opt-in so a plain `npm test`
never downloads ~70 MB of weights.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, and every workspace's tests against a
throwaway pgvector Postgres.

## Eval

```sh
npm run eval:places -w @vegan-bangkok/api           # rules only, slice-1 baseline
npm run eval:places -w @vegan-bangkok/api -- --slm  # with the real classifier
```

Drives the actual route via `app.inject` with the paid embedder wrapped in a call counter, then
writes a JSON report. It exits non-zero if the vegan guarantee or any hard invariant breaks, so
it doubles as a safety check rather than a benchmark you have to read by eye.

## Status

v1, and deliberately unfinished. Hosting is Railway but deployment is deferred — development is
local-only for now. Known follow-ups are tracked at the bottom of
[`docs/place-search-pipeline.md`](docs/place-search-pipeline.md).

Working on this with an agent? [`AGENTS.md`](AGENTS.md) is the runbook.
