CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"region_id" uuid,
	"name_en" text NOT NULL,
	"name_th" text,
	"description" text,
	"spice_level" integer,
	"tags" text[],
	"order_phrase" text,
	"skip_ingredients" text,
	"embedding_input" text,
	"embedding" vector(1536),
	"embedding_model" text,
	"embedded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "place_dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"place_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"verified_vegan" boolean DEFAULT false NOT NULL,
	"source" text,
	"confidence" real,
	"loved_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "place_dish_uq" UNIQUE("place_id","dish_id")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"name" text NOT NULL,
	"neighbourhood" text,
	"lat" double precision,
	"lng" double precision,
	"vegan_status" text,
	"price_band" integer,
	"hours" jsonb,
	"nearest_station" text,
	"photo_url" text,
	CONSTRAINT "vegan_status_ck" CHECK ("places"."vegan_status" in ('fully_vegan','vegetarian_jay','vegan_friendly')),
	CONSTRAINT "price_band_ck" CHECK ("places"."price_band" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "regions_name_uq" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_dishes" ADD CONSTRAINT "place_dishes_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_dishes" ADD CONSTRAINT "place_dishes_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE dishes ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple',
    coalesce(name_en,'') || ' ' || coalesce(description,''))) STORED;