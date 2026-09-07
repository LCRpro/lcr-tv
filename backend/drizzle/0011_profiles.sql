-- Un compte, plusieurs profils.
--
-- Le compte porte l'identite et les droits : c'est lui qui s'authentifie, lui
-- que l'administrateur active ou desactive, lui qui consomme les connexions de
-- l'abonnement. Le profil porte les *gouts* : la liste, l'historique, les
-- chaines epinglees. Sans cette separation, la maison partageait une seule
-- « reprendre la lecture » et une seule liste de favoris, ce qui rendait les
-- deux inutilisables des qu'on est plus d'un a regarder.
CREATE TABLE "profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  -- Vignette choisie dans une liste, jamais un fichier televerse : pas de
  -- stockage a gerer, pas de contenu a moderer, et l'avatar reste lisible a
  -- trois metres sur un ecran de television.
  "avatar" text NOT NULL DEFAULT 'wave',
  "color" text NOT NULL DEFAULT 'cyan',
  -- Profil enfant : masque les categories adultes quoi qu'autorise le compte,
  -- et sert de reperage visuel dans le selecteur.
  "is_kid" boolean NOT NULL DEFAULT false,
  /*
   * L'acces adulte du profil ne peut qu'etre plus restrictif que celui du
   * compte, jamais plus permissif : `users.can_watch_adult` reste le plafond,
   * pose par l'administrateur. Le profil choisit en dessous.
   */
  "can_watch_adult" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "profiles_user_idx" ON "profiles" USING btree ("user_id","created_at");--> statement-breakpoint
-- Deux profils du meme nom dans un meme foyer ne se distinguent plus.
CREATE UNIQUE INDEX "profiles_user_name_idx" ON "profiles" USING btree ("user_id", lower("name"));--> statement-breakpoint
-- Chaque compte existant recoit son profil, nomme d'apres son adresse. Ses
-- favoris et son historique lui sont rattaches juste apres : rien n'est perdu.
INSERT INTO "profiles" ("user_id", "name", "can_watch_adult")
SELECT id, initcap(split_part(email, '@', 1)), can_watch_adult FROM "users";--> statement-breakpoint
-- Le profil choisi vit dans la session : recharger la page ne doit pas
-- redemander qui regarde. Nul tant que le choix n'est pas fait.
ALTER TABLE "sessions" ADD COLUMN "profile_id" integer REFERENCES "profiles"("id") ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "favorites" ADD COLUMN "profile_id" integer REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
UPDATE "favorites" f SET "profile_id" = p.id FROM "profiles" p WHERE p.user_id = f.user_id;--> statement-breakpoint
DELETE FROM "favorites" WHERE "profile_id" IS NULL;--> statement-breakpoint
ALTER TABLE "favorites" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_user_id_item_type_item_id_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "favorites_user_created_idx";--> statement-breakpoint
ALTER TABLE "favorites" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_profile_id_item_type_item_id_pk" PRIMARY KEY("profile_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "favorites_profile_created_idx" ON "favorites" USING btree ("profile_id","created_at");--> statement-breakpoint

ALTER TABLE "favorite_categories" ADD COLUMN "profile_id" integer REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
UPDATE "favorite_categories" f SET "profile_id" = p.id FROM "profiles" p WHERE p.user_id = f.user_id;--> statement-breakpoint
DELETE FROM "favorite_categories" WHERE "profile_id" IS NULL;--> statement-breakpoint
ALTER TABLE "favorite_categories" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "favorite_categories" DROP CONSTRAINT "favorite_categories_user_id_category_id_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "favorite_categories_user_idx";--> statement-breakpoint
ALTER TABLE "favorite_categories" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "favorite_categories" ADD CONSTRAINT "favorite_categories_profile_id_category_id_pk" PRIMARY KEY("profile_id","category_id");--> statement-breakpoint
CREATE INDEX "favorite_categories_profile_idx" ON "favorite_categories" USING btree ("profile_id","created_at");--> statement-breakpoint

ALTER TABLE "watch_progress" ADD COLUMN "profile_id" integer REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
UPDATE "watch_progress" w SET "profile_id" = p.id FROM "profiles" p WHERE p.user_id = w.user_id;--> statement-breakpoint
DELETE FROM "watch_progress" WHERE "profile_id" IS NULL;--> statement-breakpoint
ALTER TABLE "watch_progress" ALTER COLUMN "profile_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "watch_progress" DROP CONSTRAINT "watch_progress_user_id_item_type_item_id_pk";--> statement-breakpoint
DROP INDEX IF EXISTS "watch_progress_user_updated_idx";--> statement-breakpoint
ALTER TABLE "watch_progress" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_profile_id_item_type_item_id_pk" PRIMARY KEY("profile_id","item_type","item_id");--> statement-breakpoint
CREATE INDEX "watch_progress_profile_updated_idx" ON "watch_progress" USING btree ("profile_id","updated_at");
