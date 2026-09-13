# Vegan Bangkok Admin — Usage Guide

## What this is

This app is the internal admin panel for the Vegan Bangkok database. It gives you a browser UI to browse and edit every table in the database (places, dishes, ingredients, aliases, join tables, scan misses, and so on), and it hosts the Thai term-mining pipeline that turns failed menu-scan lookups into new catalog entries. It also lets you re-run the Google Places + Gemini enrichment for a single place, and re-export the mobile app's bundled catalog after you change data.

It is a local-development tool only. There is no real authentication, no user accounts, and no audit trail — it is meant to run on your machine against your local database, protected by nothing more than a shared token. Do not deploy it anywhere public as-is (see the Limits section at the end).

## Prerequisites

Before starting the admin you need:

1. **The local Postgres container running.** The database lives in the `vb-postgres` Docker container, listening on port **55432**, with database name **`vegan_bangkok`** (user `vb`, password `vb`). If the container is not running, start it with `docker start vb-postgres`.
2. **`DATABASE_URL` set** in `apps/admin/.env` (see Setup below).
3. **For the term-mining page only:** the OCR/NLP Python sidecar must be running, because tokenization happens over HTTP. Start it with:
   ```bash
   cd ocr-service && . .venv/bin/activate && python server.py
   ```
   It listens on port 8091 by default. If you run it elsewhere, point the admin at it with the `OCR_URL` environment variable (default `http://127.0.0.1:8091`).
4. **For the per-place Re-enrich button only:** `GOOGLE_PLACES_API_KEY` and `GEMINI_API_KEY` must be set in `apps/admin/.env`. The re-enrich server action runs inside the admin's own process, so the keys have to be in the admin's environment (having them only in `apps/api/.env` is not enough).

## Setup

From `apps/admin/`, copy the example environment file and fill it in:

```bash
cp .env.example .env
```

Then edit `.env`:

- `DATABASE_URL` — the real local connection string is:
  ```
  DATABASE_URL=postgres://vb:vb@localhost:55432/vegan_bangkok
  ```
  The `.env.example` value is exactly this URL, so for the standard local setup the copy works as-is.
- `ADMIN_TOKEN` — pick any secret string. This is the token you will pass in the URL on first visit.
- `OCR_URL` — leave the default (`http://127.0.0.1:8091`) unless you run the sidecar on a different port.

Finally, install dependencies once at the **repo root**:

```bash
npm install
```

## Running

Start the dev server from the repo root:

```bash
npm run dev -w @vegan-bangkok/admin
```

Then open:

```
http://localhost:3100/?token=YOUR_ADMIN_TOKEN
```

### How the token gate works

The gate lives in `src/proxy.ts` (Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`; the behavior is the same). On your first visit you append `?token=YOUR_ADMIN_TOKEN` to any URL. If the token matches `ADMIN_TOKEN`, the proxy sets an httpOnly `admin_token` cookie and redirects you to the same page without the query parameter. From then on every plain URL works — the cookie carries the token.

Two edge cases worth knowing:

- If `ADMIN_TOKEN` is **unset** in the environment, the gate is wide open — every request passes. This is a deliberate convenience for pure-local use, not a bug.
- If `ADMIN_TOKEN` is set and you arrive with a wrong or missing token (and no valid cookie), you get a plain **401 Unauthorized** page telling you to append `?token=YOUR_ADMIN_TOKEN`.

The dashboard (home page) shows one card per table with its live row count; click any card to jump to that table's list view.

## Browsing and editing any table

### Navigation

The pill bar at the top of every page links to the Dashboard, the Term mining page, and every table in the registry (regions, dishes, places, placeDishes, dishAliases, ingredients, ingredientAliases, dishIngredients, menuScanMisses, queryEmbeddingCache), sorted alphabetically.

### List view

Clicking a table shows its rows in a data table. The list is **capped at 200 rows** — there is no pagination in v1. If you need to work with a table beyond the first 200 rows, use the Drizzle Studio escape hatch described below. Each row links to its edit page, and the **+ New** button in the header opens a blank create form.

### Create / edit / delete

The create and edit pages render one form field per column. The form is generated from the database schema itself, so every table gets a working editor without any per-table code. Column types map to widgets like this:

- **Enum columns** (for example `places.veganStatus`, `ingredients.veganRiskClass`, `dishIngredients.role`) become **dropdowns** with only the allowed values, plus an empty option for nullable columns.
- **Foreign-key columns** (for example `dishes.regionId` or `placeDishes.placeId`) become **pickers** — a dropdown listing the rows of the referenced table by a human-readable label (a place's name, a dish's English name), not raw UUIDs.
- **`hours`** (and any other JSON column) becomes a **JSON textarea**. What you type must be valid JSON or the save will fail.
- **Embedding (vector) columns are hidden everywhere** — they never appear in lists or forms. They are machine-written by the enrichment pipeline and there is nothing sensible to hand-edit.
- **`id`, `createdAt`, and `updatedAt` are read-only** — shown for reference but never written by the form. The same goes for **pipeline-managed columns** (`embeddingInput`, `embeddingModel`, `embeddedAt` on places and dishes, plus `fetchedAt`/`enrichedAt` on places): they are written only by the enrichment/embedding jobs, and hand-editing `embeddingInput` would trigger a paid re-embed and break the embedding↔input correspondence.
- **Multi-line text columns** (`places.summary`, `dishes.description`) are edited in a **textarea**, so newlines survive a save round-trip.
- Boolean columns become checkboxes, numbers become number inputs, array columns are edited as comma-separated text.

Fields marked with `*` are required. Clearing a field saves `NULL` for optional columns.

### Tags

Dishes and ingredients carry **faceted tags** drawn from a shared controlled vocabulary (the `tags` table), linked through the `dish_tags` / `ingredient_tags` join tables — these join tables are the source of truth (the old flat `dishes.tags` column is gone). Every tag belongs to exactly one of **five facets**: `flavor`, `cooking_method`, `form`, `ingredient_type`, or `course`.

- **Growing the vocabulary:** approving a mined term as a **tag** on the Term mining page (choose the facet in the dropdown) adds it to the vocabulary. You can also edit the `tags` table directly like any other table.
- **Linking tags:** every **dish** and **ingredient** edit page has a **Tags** panel — a grouped picker showing the vocabulary as pill buttons grouped by facet. Toggle the pills and click **Save tags**; the selection replaces the entity's tag links.
- **What dish tags feed:** two things. (1) **Search filtering** — the search API accepts faceted tag filters (e.g. only `flavor: sour` dishes). (2) **Semantic search** — a dish's tags are folded into its embedding input as facet-labelled lines, so re-embedding makes "sour soups"-style queries land better. Changing tags does **not** re-embed by itself; the new vectors are picked up on the next `npm run embed:backfill` (from `apps/api`).

### Deleting

Every edit page has a **Delete** button. It always asks for confirmation first ("This cannot be undone"). If the row is referenced by other rows — say you try to delete a dish that still has `placeDishes` or `dishAliases` pointing at it — the delete fails safely and shows a readable message: *"Cannot delete: other rows reference this record."* Delete (or reassign) the referencing rows first, then retry.

## The term-mining pipeline

The `/terms` page turns menu-scan failures into new catalog entries. When the mobile app's menu scanner reads a line of Thai it cannot match, that line lands in the `menu_scan_misses` table (~640 rows at the time of writing). The pipeline mines those misses for real dish and ingredient names we should know about.

**Make sure the OCR sidecar is running first** (see Prerequisites) — the pipeline calls it for tokenization and will fail with a "tokenize sidecar" error if it is down.

Step by step:

1. Open **Term mining** in the nav and click **Run pipeline**.
2. The server reads every `raw_text` line from `menu_scan_misses` and sends the batch to the sidecar's `POST /tokenize` endpoint, which segments the Thai text into words using PyThaiNLP's `newmm` engine. (Thai has no spaces between words, which is why a real tokenizer is needed rather than a `split`.)
3. Each token is normalized and checked against the set of **known terms**. "Known" means the term already exists somewhere in the catalog: it is either a dish's Thai name (`dishes.name_th`), a dish alias (`dish_aliases.alias_normalized`), or an ingredient alias (`ingredient_aliases.alias_normalized`). All of these — and every mined token — are run through the same `normalizeName` function the search pipeline uses, so the comparison is apples-to-apples.
4. Tokens that survive are the **unknown terms**. They are ranked by how often they appear across all miss lines and shown in a table (the top 100), most frequent first. **Single-character tokens are dropped** before ranking: at one character they are almost always OCR misreads or tokenizer fragments, not real words, and they would otherwise dominate the top of the list as noise.
5. For each term you want to keep, choose what to add it as in the **add as** dropdown:
   - **dish** — creates a new row in `dishes` with the term as the Thai name. Optionally type an English name; if you leave it blank the Thai term is used for both.
   - **ingredient** — creates a new row in `ingredients` **plus** an `ingredient_aliases` row for the term itself (the scan pipeline and the known-terms set both read the alias table, so an ingredient without an alias would be invisible to them). Fill in the **veganRiskClass**: `hard_block` (never vegan, e.g. fish sauce), `conditional_review` (sometimes a problem — the default), or `safe`.
   - **alias** — records the term as another way of writing an existing ingredient. This requires the **ingredient UUID** of the row it aliases (copy it from the ingredients table).
   - **tag** — adds the term to the shared tag vocabulary under the **facet** you pick in the dropdown (flavor, cooking_method, form, ingredient_type, or course). See the **Tags** section above for how tags are linked and what they feed.
6. Click **approve**. The row flips to "added ✓" and the term is in the database immediately. On the next pipeline run it will count as known and no longer appear.
7. When you are done approving terms (or after any other catalog edits), click **Re-export bundle**. This regenerates the mobile app's bundled catalog — it rewrites `apps/mobile/assets/data/dishes.json` and `apps/mobile/assets/data/places.json` from the current database contents. Nothing reaches the mobile app until you do this.

## Re-enrich (places)

Every **place** edit page has a **Re-enrich (Google + Gemini)** button. Clicking it re-runs the enrichment pipeline for that one place: it fetches fresh facts from the **Google Places API** (using the place's `google_place_id`, which must be set) and then has **Gemini** regenerate the derived content. It **overwrites** the place's `summary`, `vibeTags`, and `embedding`, and updates the enrichment timestamps — any manual edits to those fields are lost.

Use it when a place's Google data has changed (moved, renamed, new hours), when the summary or vibe tags look stale or wrong, or after setting a `google_place_id` on a place that never had one.

**Cost note:** every click makes real Google Places and Gemini API calls and spends real quota/money. It is fine for one-off fixes; do not click it in a loop across many places — bulk enrichment belongs to the API-side script (`npm run enrich` in `apps/api`).

Failures come back as readable messages under the button (missing `google_place_id`, Google reporting the place closed, missing API keys, partial failure where facts saved but the summary/embedding step failed).

## Escape hatch: Drizzle Studio

For anything the admin UI cannot do — rows past the 200-row cap, ad-hoc SQL, bulk updates, inspecting embedding columns — run Drizzle Studio from the API package:

```bash
cd apps/api && npm run db:studio
```

This opens Drizzle Studio in your browser against the same local database, with full raw access to every table and column.

## Limits (v1)

These are deliberate v1 scope cuts, with a note on where each would land if the tool ever grows up:

- **Local-only auth.** A single shared token in a cookie, and no gate at all when `ADMIN_TOKEN` is unset. Fine for one person on localhost; not fine hosted. Real auth (per-user accounts, sessions, HTTPS-only cookies) would land in `src/proxy.ts` plus a proper identity provider the day this is deployed anywhere.
- **200-row list cap, no pagination or search.** Would land in the generic list page (`src/app/[table]/page.tsx`) as offset/cursor pagination and a filter box. Until then, Drizzle Studio is the workaround.
- **No bulk edit.** Every change is one row at a time. Bulk operations (multi-select + batch update/delete) would land in the list view and the server actions in `src/lib/actions.ts`.
- **No audit log.** Nothing records who changed what or when beyond the row's own `updatedAt`. An audit trail would land as a new table in `packages/db` written from the create/update/delete server actions — worth doing before more than one person uses this.
