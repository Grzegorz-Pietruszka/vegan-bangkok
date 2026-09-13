ALTER TABLE "places" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "vibe_tags" text[];--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "venue_type" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "embedding_input" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "embedded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_google_place_id_uq" UNIQUE("google_place_id");