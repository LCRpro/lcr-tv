-- Chaque compte apporte ses propres abonnements.
--
-- Les providers etaient globaux : un seul catalogue, partage par tout le monde,
-- et les connexions simultanees d'un abonnement etaient prises par n'importe
-- quel compte. Ouvrir l'inscription dans ces conditions revenait a distribuer
-- sa place devant la television a des inconnus.
--
-- Rattaches au compte, ils rendent l'inscription libre sans consequence : un
-- nouveau venu arrive avec son propre abonnement, voit son propre catalogue et
-- consomme ses propres connexions. Le catalogue est deja porte par
-- `provider_id` sur `categories`, `streams`, `series` et `epg_programmes` :
-- l'isolation suit sans toucher a ces tables.
--
-- La spec §5.1 tranche au passage la question de l'administration : les
-- identifiants du provider ne sont « jamais renvoyes par l'API meme a un
-- admin ». Un abonnement est donc une affaire de compte, pas d'administration.
ALTER TABLE "providers" ADD COLUMN "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Les abonnements existants reviennent au premier administrateur : c'est lui
-- qui les avait saisis, et lui seul en connait les identifiants.
UPDATE "providers" SET "user_id" = (
  SELECT id FROM "users" WHERE role = 'admin' ORDER BY id LIMIT 1
) WHERE "user_id" IS NULL;--> statement-breakpoint
-- Aucun admin : la base est vide ou incoherente, un abonnement orphelin ne
-- servirait personne.
DELETE FROM "providers" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "providers" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "providers_active_idx";--> statement-breakpoint
-- L'index sert la question posee a chaque requete de catalogue : « quels
-- abonnements actifs ce compte a-t-il ? ».
CREATE INDEX "providers_user_active_idx" ON "providers" USING btree ("user_id","is_active");
