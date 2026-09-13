# AGENTS.md — implementing the Vegan Bangkok build

You are an agent implementing this app from pre-written, adversarially-audited plans. Follow this file exactly. A human owns the accounts, keys, and the curated data; you own the code. When you lack a secret or a decision, **stop and ask — never fabricate keys or invent catalog data.**

## Read first (in this order)
1. `app.md` — project index.
2. `infrastructure-design/infrastructure.md` — the confirmed stack and the **decisions log, which is the source of truth** for every choice.
3. The four plans (your work, in execution order): `infrastructure-design/02-api-skeleton-plan.md` → `03-data-model-plan.md` → `01-mobile-scaffold-plan.md` → `04-maps-mapbox-plan.md`.
4. `infrastructure-design/PLAN-AUDIT-2026-07-02.md` — 30 issues were found and fixed in these plans before you arrived; the audit's *meta-finding* is your standing warning (below).
5. The memory index at `.../memory/MEMORY.md`.

## Execution protocol
- Use **`superpowers:subagent-driven-development`** (preferred) or **`superpowers:executing-plans`**. Each plan already carries the required-sub-skill header.
- **One plan (milestone) at a time, in order: 02 → 03 → 01 → 04.** Do **not** start the next plan until the current one's final verify-gate is green **and the human has confirmed.** No racing ahead, no parallel half-built milestones.
- Work **task-by-task, test-first:** write the failing test → run it (see it fail) → minimal real code → run it (pass) → commit. Commit at each task boundary.
- Milestone gates: **M0** `npm install` + schemas build; **M1** local `/health` + deployed Railway healthcheck *(2026-07-02: Railway deploy deferred by the human — M1 gate = local `/health` against the local pgvector container; execute plan 02 Task 7 when Railway is provisioned)*; **M2** migrate + seed + `/search` returns ranked dishes + eval; **M3** offline cold-boot renders the bundled catalog; **M5** map renders cream canvas + clustered pins. Report the gate result to the human and wait.

## The audit meta-warning (do not repeat it)
The plans' worst defects were **green gates that didn't prove what they claimed** (idempotency untested, eval on a 1-dish corpus, symbolication on an unminified build, a typography branch never exercised). When any test/verify step passes, **confirm it exercised the real behavior, not a trivial case.** If a gate can pass while the feature is broken, harden the gate.

## Global constraints (non-negotiable)
- **Node 24 native TypeScript.** No build step for `apps/api`; relative imports carry `.ts`; `erasableSyntaxOnly` + `verbatimModuleSyntax` → **no enums, no decorators, no tsconfig path-aliases** in API code. `tsc --noEmit` is a required gate (type-stripping does not type-check).
- **`packages/schemas` is the only package that emits JS** (`tsc → dist`). Its barrel uses the **`.js`** output specifier (`export * from './domain.js'`), not `.ts`. Import the package by name (`@vegan-bangkok/schemas`).
- **No auth / no accounts / no `users` table in v1.** Passport + saves are device-local (AsyncStorage).
- **Catalog is bundle-only in v1.** The API surface is deliberately small: `POST /search`, `GET /dishes/:id/similar`, `POST /scan-menu` (M8), `POST /itinerary` (M7), `POST /chat` (M9). There is **no `GET /places`** endpoint; the app reads the bundled `places.json`.
- **Thai = option C:** Thai **UI** localization is parked to v2, but all Thai **content** stays — the vendor-card Thai script, `name_th`, Noto Sans Thai font, and script-aware typography are core and remain.
- **Embeddings:** `gemini-embedding-001` @ 1536 dims, `task_type` RETRIEVAL_DOCUMENT/QUERY, L2-normalize. `gemini-embedding-2` is a **documented later swap — do not wire it now.**
- **Postgres:** the Railway **pgvector-pg18** template (the plain image lacks pgvector). **Never `drizzle-kit push`** a pgvector schema — `generate` + reviewed migration only. No vector index in v1 (exact scan).
- **Media = URL only** in the DB; never blobs. No dedicated vector DB, no Redis, no offline map pack, no recorded audio in v1.

## Cross-plan contract (keep these identical across plans)
- Shared Zod names: `healthResponse` (M1), then `place`, `dish`, `dishResult`, `searchQuery`, `searchResponse` (M2). `place.verified` is **optional**, populated per entry in the M3 bundle (drives green/yellow map pins).
- `placesSeed` is a **named export** (`export const placesSeed`) — import it **named** (`import { placesSeed }`), never default.
- DB access: `db`, `pool`, `type DB` from `apps/api/src/db/index.ts`.
- Search module signatures: `searchByVector(queryEmbedding, opts?)`, `searchSimilar(dishId, opts?)`, both returning `DishResult[]`; the injected embedder is `(texts: string[]) => Promise<number[][]>`.

## Do NOT (unless the human explicitly asks)
Add auth, a Thai UI / `th.json`, a `GET /places` endpoint, a dedicated vector DB, Redis, `drizzle-kit push`, `gemini-embedding-2`, the offline tile pack, or multimodal/photo search. These are v2 or deferred; building them now contradicts the decisions log.

## When you need something from the human
Stop and ask for: Railway `DATABASE_URL` (+ confirm the pgvector-pg18 template), `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY` (Places API New — plan 09 enrichment) + curated `seed/place-ids.json`, Sentry `DSN`/org/project + EAS auth token, the Mapbox **`pk.`** token, the EAS project (from `eas init`), and — beyond the example seed — the **real ~200-place curated catalog**. Do not proceed past a gate that needs one of these until it's provided.
