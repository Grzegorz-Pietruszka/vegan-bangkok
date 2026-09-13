CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "geog" geography(Point,4326)
  GENERATED ALWAYS AS (
    CASE WHEN lng IS NOT NULL AND lat IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    END
  ) STORED;
--> statement-breakpoint
CREATE INDEX "places_geog_gist" ON "places" USING gist ("geog");
--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(neighbourhood,''))
  ) STORED;
--> statement-breakpoint
CREATE INDEX "places_search_tsv_gin" ON "places" USING gin ("search_tsv");
