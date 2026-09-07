CREATE OR REPLACE FUNCTION public.work_base_title(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$ SELECT public.normalize_name(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace($1, '^[[:space:]]*[A-Za-z]{2,8}[[:space:]]*[-|][[:space:]]*', ''), '\[[^]]*\]|\([^)]*\)', ' ', 'g'), '[[:space:]]*[-–][[:space:]]*(19|20)[0-9]{2}', ' ', 'g'), '[[:space:]]+((19|20)[0-9]{2})[[:space:]]*$', ' ', 'g'), ' -')) $fn$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.work_year(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$ SELECT (regexp_match($1, '.*((19|20)[0-9]{2})'))[1] $fn$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.work_key(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$ SELECT public.work_base_title($1) || '|' || coalesce(public.work_year($1), '') $fn$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.lang_rank(text) RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$ SELECT CASE upper(coalesce((regexp_match($1, '^[[:space:]]*([A-Za-z]{2,8})[[:space:]]*[-|]'))[1], '')) WHEN 'FR' THEN 0 WHEN 'VF' THEN 0 WHEN 'VFF' THEN 0 WHEN 'TRUEFRENCH' THEN 0 WHEN 'VOSTFR' THEN 1 WHEN 'MULTI' THEN 2 WHEN 'EN' THEN 3 ELSE 9 END $fn$;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "work_key" text GENERATED ALWAYS AS (public.work_key(name)) STORED;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "lang_rank" integer GENERATED ALWAYS AS (public.lang_rank(name)) STORED;--> statement-breakpoint
ALTER TABLE "streams" ADD COLUMN "work_key" text GENERATED ALWAYS AS (public.work_key(name)) STORED;--> statement-breakpoint
ALTER TABLE "streams" ADD COLUMN "lang_rank" integer GENERATED ALWAYS AS (public.lang_rank(name)) STORED;--> statement-breakpoint
CREATE INDEX "series_work_idx" ON "series" USING btree ("work_key","lang_rank","id");--> statement-breakpoint
CREATE INDEX "streams_work_idx" ON "streams" USING btree ("type","work_key","lang_rank","id");
