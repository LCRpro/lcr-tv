-- Filtres de langue par profil, séparés par type de contenu.
--
-- Distincts de `languages` (qui ne fait qu'ordonner) : là où une liste est non
-- vide, le catalogue de ce type ne remonte que les œuvres disponibles dans
-- l'une de ces langues. Vide = aucun filtre, tout remonte comme avant.
ALTER TABLE "profiles" ADD COLUMN "lang_filter_vod" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "lang_filter_series" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "lang_filter_live" text[] DEFAULT '{}' NOT NULL;
