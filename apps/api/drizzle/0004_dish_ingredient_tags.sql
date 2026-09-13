CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"facet" text NOT NULL,
	"name_en" text NOT NULL,
	"name_th" text,
	"normalized" text NOT NULL,
	"description" text,
	CONSTRAINT "tags_normalized_uq" UNIQUE("normalized"),
	CONSTRAINT "tag_facet_ck" CHECK ("tags"."facet" in ('flavor','cooking_method','form','ingredient_type','course'))
);
--> statement-breakpoint
CREATE TABLE "dish_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"dish_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "dish_tag_uq" UNIQUE("dish_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "ingredient_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"ingredient_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "ingredient_tag_uq" UNIQUE("ingredient_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "dish_tags" ADD CONSTRAINT "dish_tags_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_tags" ADD CONSTRAINT "dish_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_tags" ADD CONSTRAINT "ingredient_tags_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_tags" ADD CONSTRAINT "ingredient_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
