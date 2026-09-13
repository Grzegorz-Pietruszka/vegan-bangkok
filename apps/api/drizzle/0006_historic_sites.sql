CREATE TABLE "historic_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"name" text NOT NULL,
	"name_th" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"category" text NOT NULL,
	"summary" text,
	"vibe_tags" text[],
	"embedding_input" text,
	"embedding" vector(1536),
	"embedding_model" text,
	"embedded_at" timestamp with time zone,
	CONSTRAINT "historic_sites_name_uq" UNIQUE("name"),
	CONSTRAINT "historic_sites_category_ck" CHECK ("historic_sites"."category" in ('temple','museum','market','monument','palace','park','neighborhood','bridge','shrine','cultural-site'))
);
