-- Les langues mises en avant, par profil.
--
-- Tout ce qui classait le catalogue disait « francais d'abord » en dur : le
-- rang de langue des lignes, l'ordre de la colonne de categories, les rangees
-- d'ajouts recents, la mise en avant. C'etait le bon defaut pour ce foyer, mais
-- c'etait un defaut ecrit dans le code, pas un choix.
--
-- Chaque profil porte desormais sa propre liste, de une a trois langues, dans
-- l'ordre de sa preference. Sur le profil, pas sur le compte : c'est la meme
-- raison que pour les favoris et la progression — deux personnes d'un meme
-- foyer ne regardent pas dans la meme langue.
ALTER TABLE "profiles" ADD COLUMN "languages" text[] NOT NULL DEFAULT '{FR}';--> statement-breakpoint

-- Le code de langue tel que le fournisseur le prefixe, extrait une fois pour
-- toutes.
--
-- La detection passait par un `regexp_match` execute a chaque requete : sur les
-- 311 908 lignes de films, cela coutait 1,3 s par balayage. Stockee, la valeur
-- se lit, s'indexe et se compare a n'importe quelle liste de preferences —
-- c'est ce qui rend le classement configurable sans le rendre lent.
--
-- Meme expression que `lang_rank`, dont cette colonne prend la releve : un
-- rang fige a un seul ordre ne peut pas servir trois profils qui n'ont pas les
-- memes langues.
CREATE OR REPLACE FUNCTION public.lang_code(name text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT nullif(
    upper(coalesce((regexp_match($1, '^[[:space:]]*([A-Za-z]{2,8})[[:space:]]*[-|]'))[1], '')),
    ''
  )
$$;--> statement-breakpoint

ALTER TABLE "streams" ADD COLUMN "lang_code" text
  GENERATED ALWAYS AS (public.lang_code(name)) STORED;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "lang_code" text
  GENERATED ALWAYS AS (public.lang_code(name)) STORED;--> statement-breakpoint

-- Le choix du representant d'une oeuvre se fait desormais sur ce code : l'index
-- de groupe le porte a la place du rang.
CREATE INDEX IF NOT EXISTS "streams_group_lang_idx"
  ON "streams" ("type", "group_key", "lang_code", "quality_rank", "id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "series_work_lang_idx"
  ON "series" ("work_key", "lang_code", "id");
