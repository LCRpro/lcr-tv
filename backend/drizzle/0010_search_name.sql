-- Nom de recherche : le titre debarrasse du bruit du fournisseur.
--
-- La recherche comparait la requete a `name_normalized`, c'est-a-dire au nom
-- brut : « fr - canal+ fhd ◉ ». Le prefixe de langue, la qualite et les
-- decorations diluaient la similarite trigramme au point d'inverser le
-- classement — « canal + » remontait « ##### MX - CANAL ##### » (0,667) et
-- « GT - CANAL 3 » (0,545) devant « FR - CANAL+ FHD » (0,500), mesure sur le
-- catalogue reel. On cherche donc sur le nom nettoye, la ou les mots du titre
-- ne sont plus noyes.
CREATE OR REPLACE FUNCTION public.search_name(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$
  SELECT public.normalize_name(
    btrim(
      regexp_replace(
        regexp_replace(
          public.strip_decor(
            regexp_replace(
              regexp_replace($1, '#+', ' ', 'g'),
              '^[[:space:]]*[A-Za-z]{2,8}[[:space:]]*[-|][[:space:]]*', ''
            )
          ),
          '[[:space:]]+[[(]?(FHD|UHD|HD|SD|HEVC|H\.?265|H\.?264|4K|8K|2160P|1080P|720P|576P|480P|ᴴᴰ)[])]?[[:space:]]*$', '', 'i'
        ),
        '[[:space:]]+', ' ', 'g'
      ),
      ' -'
    )
  )
$fn$;--> statement-breakpoint
-- Forme « serree » : sans espace ni ponctuation, le « + » excepte.
--
-- L'utilisateur tape « canal + », la chaine s'appelle « CANAL+ » ; il tape
-- « bein sport », elle s'appelle « beIN SPORTS 1 ». Comparer les prefixes sur
-- une forme sans separateurs rend ces ecarts sans consequence, alors qu'un
-- `like 'canal +%'` echoue sur les deux.
--
-- Le « + » est garde parce qu'il porte du sens dans les noms de chaines :
-- CANAL+, M6+, Paramount+, Apple TV+. Sans lui, « canal + » ne distinguait plus
-- « CANAL+ 4K+ » de « CANAL J », qui remontait devant.
CREATE OR REPLACE FUNCTION public.tight_name(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $fn$
  SELECT regexp_replace(public.search_name($1), '[^a-z0-9+]+', '', 'g')
$fn$;--> statement-breakpoint
ALTER TABLE "streams" ADD COLUMN "search_name" text GENERATED ALWAYS AS (public.search_name(name)) STORED;--> statement-breakpoint
ALTER TABLE "streams" ADD COLUMN "tight_name" text GENERATED ALWAYS AS (public.tight_name(name)) STORED;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "search_name" text GENERATED ALWAYS AS (public.search_name(name)) STORED;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "tight_name" text GENERATED ALWAYS AS (public.tight_name(name)) STORED;--> statement-breakpoint
CREATE INDEX "streams_search_trgm_idx" ON "streams" USING gin ("search_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "series_search_trgm_idx" ON "series" USING gin ("search_name" gin_trgm_ops);--> statement-breakpoint
-- Le palier de correspondance se lit par prefixe : un index btree sur la forme
-- serree sert les tests `like 'xxx%'` sans parcourir la table.
CREATE INDEX "streams_tight_idx" ON "streams" USING btree ("tight_name" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "series_tight_idx" ON "series" USING btree ("tight_name" text_pattern_ops);
