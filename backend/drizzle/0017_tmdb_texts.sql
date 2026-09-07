-- Les textes TMDB dans plusieurs langues.
--
-- Le catalogue est classe par langue depuis que chaque profil choisit les
-- siennes, mais les synopsis restaient en francais : un profil regle en
-- allemand lisait des titres allemands surmontant un resume francais.
--
-- TMDB livre **toutes** ses traductions dans le meme appel que la fiche —
-- `append_to_response=translations`, 55 langues pour Joker, verifie. Le
-- multilingue ne coute donc aucune requete supplementaire, seulement du
-- stockage : c'est ce qui rend la decision facile, a condition de la prendre
-- avant le grand passage d'enrichissement plutot qu'apres.
--
-- La cle est l'identifiant TMDB et non la ligne du catalogue : le fournisseur
-- publie la meme oeuvre 3,26 fois en moyenne, et deux abonnements doublent
-- encore le tout. Une seule ligne par oeuvre et par langue les sert toutes.
CREATE TABLE IF NOT EXISTS "tmdb_texts" (
  -- 'movie' ou 'tv', comme les chemins de l'API.
  "kind" text NOT NULL,
  "tmdb_id" text NOT NULL,
  -- Code a deux lettres, en majuscules, comme `streams.lang_code`.
  "lang" text NOT NULL,
  "title" text,
  "plot" text,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("kind", "tmdb_id", "lang")
);--> statement-breakpoint

-- La lecture se fait toujours « ces oeuvres-la, dans cette langue-la » : les
-- fiches d'une page arrivent ensemble, et la mise en avant en demande cinq.
CREATE INDEX IF NOT EXISTS "tmdb_texts_lang_idx" ON "tmdb_texts" ("lang", "kind", "tmdb_id");
