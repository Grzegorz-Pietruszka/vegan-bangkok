CREATE TABLE "dish_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"dish_id" uuid NOT NULL,
	"alias_text" text NOT NULL,
	"alias_normalized" text NOT NULL,
	CONSTRAINT "dish_aliases_alias_normalized_uq" UNIQUE("alias_normalized")
);
--> statement-breakpoint
CREATE TABLE "dish_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"dish_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "dish_ingredient_uq" UNIQUE("dish_id","ingredient_id"),
	CONSTRAINT "dish_ingredients_role_ck" CHECK ("dish_ingredients"."role" in ('primary','hidden_risk','optional'))
);
--> statement-breakpoint
CREATE TABLE "ingredient_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"ingredient_id" uuid NOT NULL,
	"alias_text" text NOT NULL,
	"alias_normalized" text NOT NULL,
	"language" text,
	CONSTRAINT "ingredient_aliases_alias_normalized_uq" UNIQUE("alias_normalized")
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"name_en" text NOT NULL,
	"name_th" text,
	"vegan_risk_class" text NOT NULL,
	CONSTRAINT "vegan_risk_class_ck" CHECK ("ingredients"."vegan_risk_class" in ('hard_block','conditional_review','safe'))
);
--> statement-breakpoint
CREATE TABLE "menu_scan_misses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_text" text NOT NULL,
	"ocr_confidence" real,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "dish_aliases" ADD CONSTRAINT "dish_aliases_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_ingredients" ADD CONSTRAINT "dish_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;