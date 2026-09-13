CREATE TABLE "query_embedding_cache" (
	"query_norm" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "query_embedding_cache_query_norm_model_pk" PRIMARY KEY("query_norm","model")
);
--> statement-breakpoint

-- Tier 1 full-name gate: functional indexes on the normalized-name expression.
-- The expression MUST match sqlNormName() in src/search/normalize.ts character-for-character
-- (lowercase first, then strip everything outside a-z 0-9 ก-๛) or the planner can't use these.
-- Hand-appended: drizzle-kit cannot emit expression indexes. This file is the plan-08
-- "migration 0002"; drizzle's own sequence numbers it 0001.
CREATE INDEX "idx_dishes_normalized_name_en" ON "dishes"
  ((regexp_replace(lower("name_en"), '[^a-z0-9ก-๛]', '', 'g')));
--> statement-breakpoint
CREATE INDEX "idx_dishes_normalized_name_th" ON "dishes"
  ((regexp_replace(lower("name_th"), '[^a-z0-9ก-๛]', '', 'g')));
--> statement-breakpoint

-- Tier 3 degraded mode: GIN over the generated search_tsv column (created in 0000_init).
CREATE INDEX "idx_dishes_search_tsv_gin" ON "dishes" USING gin("search_tsv");
