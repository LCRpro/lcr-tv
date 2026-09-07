-- Les slots sont ephemeres (ils expirent au bout de 90 s sans signal) :
-- on vide la table plutot que d'inventer un provider pour l'historique.
DELETE FROM "playback_slots";--> statement-breakpoint
DROP INDEX "providers_single_active_idx";--> statement-breakpoint
ALTER TABLE "playback_slots" ADD COLUMN "provider_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "playback_slots" ADD CONSTRAINT "playback_slots_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playback_slots_provider_idx" ON "playback_slots" USING btree ("provider_id","released_at");--> statement-breakpoint
CREATE INDEX "providers_active_idx" ON "providers" USING btree ("is_active");