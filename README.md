# Vegan Bangkok

A curated, dish-first, story-rich vegan guide to Bangkok. Not a listings directory — a local
friend that tells you *what* to eat, *how* to order it without accidentally getting fish sauce,
and plans your day. Differentiators: a per-dish ordering/trust layer (Thai phrases, hidden-ingredient
warnings, verified confidence tiers), intent-based RAG discovery, and ~200 hand-curated places.

v1 is anonymous — no accounts. Passport and saved places are device-local.

> **New here?** Read [`app.md`](app.md) — the project index — for product, design, and architecture.
> Driving the build? [`IMPLEMENTATION-GUIDE.md`](IMPLEMENTATION-GUIDE.md) (human) and
> [`AGENTS.md`](AGENTS.md) (agent) are the runbooks.

## Layout

npm workspaces monorepo.

| Path | What | Stack |
|------|------|-------|
| `apps/mobile`  | The app | Expo SDK 57 / React Native, expo-router, Mapbox |
| `apps/api`     | Backend | Fastify 5, Zod, Drizzle |
| `apps/admin`   | Content admin | Next.js |
| `packages/schemas` | Shared Zod schemas | — |
| `packages/db`  | Drizzle schema + client | PostgreSQL + pgvector |

Search/discovery uses pgvector with Gemini embeddings. Hosting is Railway (deploy deferred — dev is local-only).

## Prerequisites

- Node **>= 24** (the API runs `.ts` directly via Node's type stripping — no build step)
- Docker (local Postgres with pgvector)
- A `GEMINI_API_KEY` for embeddings (tests don't need a real one)

## Quick start

```sh
npm ci

# shared packages must build first (apps import their dist/)
npm run build -w @vegan-bangkok/schemas -w @vegan-bangkok/db

# local Postgres — pgvector image on port 55432 (see IMPLEMENTATION-GUIDE.md)
# then, in apps/api, create .env with DATABASE_URL + GEMINI_API_KEY:
npm run db:migrate -w @vegan-bangkok/api
npm run seed      -w @vegan-bangkok/api

# run what you need
npm run dev   -w @vegan-bangkok/api     # Fastify, /health to check
npm run start -w mobile                  # Expo
npm run dev   -w @vegan-bangkok/admin    # Next.js, :3100
```

Env keys per app are in each app's `.env.example`.

## Tests

```sh
npm test -w @vegan-bangkok/api    # needs a migrated test DB (npm run db:migrate:test)
npm test -w mobile
npm test -w @vegan-bangkok/admin -w @vegan-bangkok/schemas -w @vegan-bangkok/db
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, and every workspace's tests against a
throwaway pgvector Postgres.
