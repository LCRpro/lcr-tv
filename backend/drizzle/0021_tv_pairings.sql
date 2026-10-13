-- L'association d'un téléviseur.
--
-- Un téléviseur ne se connecte pas au clavier : il demande un code, l'affiche,
-- et sonde. L'utilisateur saisit le code depuis le site ou son téléphone, ce
-- qui rattache la TV à son compte ; au sondage suivant, la TV reçoit sa
-- session. Le jeton de session n'est jamais stocké ici — il est créé au
-- sondage et remis sur-le-champ. Cette table ne garde que le code, le haché du
-- secret du téléviseur, et à qui l'associer.
CREATE TABLE "tv_pairings" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"device_secret_hash" text NOT NULL,
	"user_id" integer,
	"profile_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"device_label" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tv_pairings" ADD CONSTRAINT "tv_pairings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_pairings" ADD CONSTRAINT "tv_pairings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tv_pairings_code_idx" ON "tv_pairings" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "tv_pairings_secret_idx" ON "tv_pairings" USING btree ("device_secret_hash");
