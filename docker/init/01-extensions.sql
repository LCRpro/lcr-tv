-- Extensions requises par la recherche (titres accentués + fautes de frappe).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() est STABLE par défaut, ce qui interdit son usage dans un index.
-- On expose un wrapper IMMUTABLE utilisable en expression d'index et en génération.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

CREATE OR REPLACE FUNCTION public.normalize_name(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT lower(public.immutable_unaccent($1)) $$;
