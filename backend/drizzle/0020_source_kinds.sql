-- Plusieurs sortes de sources, et non plus une seule.
--
-- Un abonnement etait forcement un panel Xtream : une URL, un identifiant, un
-- mot de passe. C'est la porte la plus riche — categories, synopsis, saisons,
-- et surtout `max_connections`, d'ou l'indicateur de connexions tire son
-- chiffre — mais ce n'est pas la seule. Une playlist M3U est un simple fichier
-- texte, sans identifiants ni compte, que beaucoup de fournisseurs servent a
-- cote de leur panel, et que publient aussi les listes libres.
--
-- `kind` dit laquelle on a affaire. Les colonnes existantes gardent leur sens
-- pour Xtream ; pour un M3U, `base_url` porte l'adresse de la playlist et les
-- identifiants n'existent pas — d'ou leur passage en nullable.
ALTER TABLE "providers" ADD COLUMN "kind" text NOT NULL DEFAULT 'xtream';--> statement-breakpoint

-- Une playlist n'a ni compte ni mot de passe : ces colonnes ne peuvent plus
-- etre obligatoires. Elles restent chiffrees quand elles sont remplies.
ALTER TABLE "providers" ALTER COLUMN "username_enc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ALTER COLUMN "password_enc" DROP NOT NULL;--> statement-breakpoint

-- La grille d'un M3U vit ailleurs que la playlist : un fichier XMLTV separe,
-- que le fournisseur donne a part. Chez Xtream elle se deduit des identifiants
-- (`xmltv.php`), ici il faut la demander.
ALTER TABLE "providers" ADD COLUMN "epg_url" text;--> statement-breakpoint

/*
 * L'adresse du flux, quand elle ne se calcule pas.
 *
 * Chez Xtream, l'URL de lecture se fabrique a la demande : base, identifiants,
 * numero de flux. Rien n'est stocke, et c'est voulu — les identifiants ne
 * doivent pas se retrouver recopies dans 300 000 lignes de catalogue.
 *
 * Une playlist M3U ne se prete pas a ce calcul : chaque ligne porte son adresse
 * complete, souvent sur un hote different de la liste elle-meme. Il faut donc
 * la garder. La colonne reste vide pour toute source Xtream, ce qui preserve la
 * regle : aucun identifiant en clair dans `streams`.
 */
ALTER TABLE "streams" ADD COLUMN "source_url" text;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "providers_kind_idx" ON "providers" ("user_id", "kind");
