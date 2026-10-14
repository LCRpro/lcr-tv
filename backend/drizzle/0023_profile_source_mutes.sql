-- Les sources qu'un profil a désactivées.
--
-- Les connecteurs appartiennent au foyer et sont partagés par tous ses profils ;
-- chacun choisit lesquels il utilise. On stocke l'exception — ce qu'un profil a
-- éteint — pour qu'un profil neuf voie par défaut tout le catalogue du foyer.
CREATE TABLE "profile_provider_mutes" (
	"profile_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_provider_mutes_profile_id_provider_id_pk" PRIMARY KEY("profile_id","provider_id")
);
--> statement-breakpoint
ALTER TABLE "profile_provider_mutes" ADD CONSTRAINT "profile_provider_mutes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_provider_mutes" ADD CONSTRAINT "profile_provider_mutes_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
