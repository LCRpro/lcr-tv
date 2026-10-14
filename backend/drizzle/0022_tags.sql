-- Les étiquettes du profil — ses propres rayonnages, créés à la main et qui
-- traversent les types. Une « Sport » peut tenir des chaînes, des films et des
-- séries ; chaque section n'en montre que ce qui la concerne, le compte montre
-- tout. `tags` porte les noms (uniques par profil, casse ignorée), `tag_items`
-- leur contenu (un `stream` — film ou chaîne — ou une `series`).
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_items" (
	"tag_id" integer NOT NULL,
	"item_type" "item_type" NOT NULL,
	"item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_items_tag_id_item_type_item_id_pk" PRIMARY KEY("tag_id","item_type","item_id")
);
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_items" ADD CONSTRAINT "tag_items_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_profile_name_idx" ON "tags" USING btree ("profile_id",lower("name"));--> statement-breakpoint
CREATE INDEX "tags_profile_idx" ON "tags" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "tag_items_tag_idx" ON "tag_items" USING btree ("tag_id","created_at");
