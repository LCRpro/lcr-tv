-- Une seule image par ligne, pas une liste collee.
--
-- Certains panels publient `backdrop_path` comme plusieurs URLs separees par
-- des espaces dans une meme chaine :
--   http://.../285380_tv_backdrop_0.jpg http://.../285380_tv_backdrop_1.jpg
-- La lecture prenait la chaine entiere pour une adresse : 3 458 series
-- portaient une valeur qu'aucun navigateur ne pouvait charger, et la mise en
-- avant de l'accueil tombait dessus une fois sur trente.
--
-- Le parseur du sync coupe desormais a l'entree (`looseFirstUrl`). Cette
-- migration repare ce qui est deja en base, sans attendre la prochaine
-- synchronisation complete.
--
-- La coupure ne se fait que devant un `http` : le fournisseur heberge aussi des
-- fichiers dont le nom contient une espace — « .../images (30).jpg », 4 374
-- lignes cote films — et couper sur toute espace les aurait tous casses.
UPDATE "series" SET "backdrop_url" = regexp_replace("backdrop_url", '\s+https?://.*$', '')
  WHERE "backdrop_url" ~ '\s+https?://';--> statement-breakpoint
UPDATE "series" SET "cover_url" = regexp_replace("cover_url", '\s+https?://.*$', '')
  WHERE "cover_url" ~ '\s+https?://';--> statement-breakpoint
UPDATE "streams" SET "backdrop_url" = regexp_replace("backdrop_url", '\s+https?://.*$', '')
  WHERE "backdrop_url" ~ '\s+https?://';--> statement-breakpoint
UPDATE "streams" SET "icon_url" = regexp_replace("icon_url", '\s+https?://.*$', '')
  WHERE "icon_url" ~ '\s+https?://';
