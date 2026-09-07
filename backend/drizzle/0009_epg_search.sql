ALTER TABLE "epg_programmes" ADD COLUMN "title_normalized" text GENERATED ALWAYS AS (public.normalize_name(title)) STORED;--> statement-breakpoint
CREATE INDEX "epg_title_trgm_idx" ON "epg_programmes" USING gin ("title_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "epg_provider_window_idx" ON "epg_programmes" USING btree ("provider_id","channel_xmltv_id","start_at","end_at");
