CREATE TABLE "epg_programmes" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"channel_xmltv_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epg_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"error" text,
	"programmes" integer DEFAULT 0 NOT NULL,
	"channels" integer DEFAULT 0 NOT NULL,
	"bytes_read" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "tmdb_id" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "tmdb_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "streams" ADD COLUMN "epg_channel_id" text;--> statement-breakpoint
ALTER TABLE "streams" ADD COLUMN "tmdb_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "epg_programmes" ADD CONSTRAINT "epg_programmes_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epg_runs" ADD CONSTRAINT "epg_runs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "epg_programme_unique_idx" ON "epg_programmes" USING btree ("provider_id","channel_xmltv_id","start_at");--> statement-breakpoint
CREATE INDEX "epg_channel_window_idx" ON "epg_programmes" USING btree ("channel_xmltv_id","start_at","end_at");