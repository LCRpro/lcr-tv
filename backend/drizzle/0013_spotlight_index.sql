-- La mise en avant de l'accueil, sans balayer le catalogue entier.
--
-- L'accueil tire chaque jour cinq oeuvres parmi celles qui ont une image large
-- et un synopsis. Cote series le fournisseur les donne presque toujours, mais
-- cote films elles ne viennent que de l'enrichissement TMDB : 1 474 lignes sur
-- 311 908. Sans index, Postgres parcourait les 311 908 pour en retenir 83, et
-- l'accueil attendait 448 ms cette seule requete.
--
-- Index partiel : il ne contient que les lignes reellement candidates. Sa
-- taille suit l'enrichissement au lieu de suivre le catalogue, et la requete
-- passe a 73 ms. Les colonnes retenues sont celles du filtre restant — le
-- compte proprietaire, puis la langue et la note qui ordonnent le tirage.
CREATE INDEX IF NOT EXISTS "streams_spotlight_idx" ON "streams" ("provider_id", "lang_rank", "rating")
  WHERE type = 'vod' AND removed_at IS NULL AND backdrop_url IS NOT NULL AND plot IS NOT NULL;
