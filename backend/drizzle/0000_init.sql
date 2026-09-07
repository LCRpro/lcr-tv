-- Extensions et fonctions de normalisation.
-- Elles doivent exister avant les colonnes generees et les index trigram.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- unaccent() est STABLE : inutilisable telle quelle dans un index ou une colonne
-- generee. Ce wrapper la fige sur le dictionnaire par defaut.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$ SELECT public.unaccent('public.unaccent', $1) $fn$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.normalize_name(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$ SELECT lower(public.immutable_unaccent($1)) $fn$;--> statement-breakpoint
CREATE TYPE "public"."category_type" AS ENUM('live', 'vod', 'series');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('stream', 'series', 'episode');--> statement-breakpoint
CREATE TYPE "public"."stream_type" AS ENUM('live', 'vod');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"xtream_id" text NOT NULL,
	"type" "category_type" NOT NULL,
	"name" text NOT NULL,
	"is_adult" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"xtream_id" text NOT NULL,
	"season" integer NOT NULL,
	"episode_num" integer NOT NULL,
	"title" text NOT NULL,
	"container_extension" text,
	"duration_sec" integer,
	"plot" text,
	"still_url" text,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" integer NOT NULL,
	"item_type" "item_type" NOT NULL,
	"item_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_item_type_item_id_pk" PRIMARY KEY("user_id","item_type","item_id")
);
--> statement-breakpoint
CREATE TABLE "playback_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" integer,
	"item_type" "item_type" NOT NULL,
	"item_id" integer NOT NULL,
	"item_label" text DEFAULT '' NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"username_enc" text NOT NULL,
	"password_enc" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"max_connections" integer,
	"active_connections" integer,
	"status" text,
	"expires_at" timestamp with time zone,
	"server_name" text,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"xtream_id" integer NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text GENERATED ALWAYS AS (public.normalize_name(name)) STORED,
	"cover_url" text,
	"backdrop_url" text,
	"plot" text,
	"rating" real,
	"release_date" text,
	"genre" text,
	"cast_list" text,
	"director" text,
	"category_id" integer,
	"added_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"episodes_fetched_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"device_label" text,
	"user_agent" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streams" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"xtream_id" integer NOT NULL,
	"type" "stream_type" NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text GENERATED ALWAYS AS (public.normalize_name(name)) STORED,
	"icon_url" text,
	"category_id" integer,
	"container_extension" text,
	"added_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"plot" text,
	"rating" real,
	"release_date" text,
	"duration_sec" integer,
	"genre" text,
	"cast_list" text,
	"director" text,
	"backdrop_url" text,
	"tmdb_id" text,
	"info_fetched_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"phase" text DEFAULT 'categories' NOT NULL,
	"error" text,
	"counts" jsonb DEFAULT '{"categories":0,"live":0,"vod":0,"series":0,"removed":0}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"can_watch_adult" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_progress" (
	"user_id" integer NOT NULL,
	"item_type" "item_type" NOT NULL,
	"item_id" integer NOT NULL,
	"position_sec" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_progress_user_id_item_type_item_id_pk" PRIMARY KEY("user_id","item_type","item_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_slots" ADD CONSTRAINT "playback_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_slots" ADD CONSTRAINT "playback_slots_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streams" ADD CONSTRAINT "streams_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_provider_type_xtream_idx" ON "categories" USING btree ("provider_id","type","xtream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_series_xtream_idx" ON "episodes" USING btree ("series_id","xtream_id");--> statement-breakpoint
CREATE INDEX "episodes_series_order_idx" ON "episodes" USING btree ("series_id","season","episode_num");--> statement-breakpoint
CREATE INDEX "favorites_user_created_idx" ON "favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "playback_slots_live_idx" ON "playback_slots" USING btree ("released_at","heartbeat_at");--> statement-breakpoint
CREATE INDEX "playback_slots_user_idx" ON "playback_slots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_single_active_idx" ON "providers" USING btree ("is_active") WHERE "providers"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "series_provider_xtream_idx" ON "series" USING btree ("provider_id","xtream_id");--> statement-breakpoint
CREATE INDEX "series_category_idx" ON "series" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "series_removed_idx" ON "series" USING btree ("removed_at");--> statement-breakpoint
CREATE INDEX "series_name_trgm_idx" ON "series" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "streams_provider_type_xtream_idx" ON "streams" USING btree ("provider_id","type","xtream_id");--> statement-breakpoint
CREATE INDEX "streams_category_idx" ON "streams" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "streams_type_removed_idx" ON "streams" USING btree ("type","removed_at");--> statement-breakpoint
CREATE INDEX "streams_name_trgm_idx" ON "streams" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sync_runs_provider_started_idx" ON "sync_runs" USING btree ("provider_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "watch_progress_user_updated_idx" ON "watch_progress" USING btree ("user_id","updated_at");