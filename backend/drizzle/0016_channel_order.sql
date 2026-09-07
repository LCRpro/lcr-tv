-- L'ordre des chaines, celui de la telecommande.
--
-- Le direct etait trie par ordre alphabetique du nom : « 6TER », « 13EME RUE »,
-- « 20 MINUTES TV », « A LA CARTE 1 »… TF1 arrivait quelque part au milieu, et
-- il fallait chercher France 2 a la lettre F. Personne ne cherche une chaine
-- par son initiale : on la cherche a sa place, celle qu'elle occupe sur la
-- telecommande depuis toujours.
--
-- Le rang est donc celui de la numerotation du pays — TNT en France, et
-- l'equivalent ailleurs. Les chaines absentes de la table gardent l'ordre
-- alphabetique, derriere : c'est la longue traine des chaines thematiques et
-- regionales, que personne ne classe de tete.
--
-- La table est volontairement courte. Elle couvre ce qui se numerote vraiment :
-- les generalistes et les grandes chaines payantes. Au-dela, un ordre invente
-- serait moins utile qu'un ordre alphabetique, parce qu'il serait faux.
--
-- Chaque entree a ete verifiee presente dans le catalogue reel avant d'etre
-- ecrite ici ; celles qui ne le sont pas ne coutent rien : elles n'apparient
-- jamais.
CREATE OR REPLACE FUNCTION public.channel_rank(name text) RETURNS int
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE coalesce(public.lang_code($1), '') || ':' || public.tight_name($1)

    -- France, numerotation TNT.
    WHEN 'FR:tf1' THEN 1
    WHEN 'FR:france2' THEN 2
    WHEN 'FR:france3' THEN 3
    WHEN 'FR:canal+' THEN 4
    WHEN 'FR:france5' THEN 5
    WHEN 'FR:m6' THEN 6
    WHEN 'FR:arte' THEN 7
    WHEN 'FR:c8' THEN 8
    WHEN 'FR:w9' THEN 9
    WHEN 'FR:tmc' THEN 10
    WHEN 'FR:tfx' THEN 11
    WHEN 'FR:nrj12' THEN 12
    WHEN 'FR:lcp' THEN 13
    WHEN 'FR:france4' THEN 14
    WHEN 'FR:bfmtv' THEN 15
    WHEN 'FR:cnews' THEN 16
    WHEN 'FR:cstar' THEN 17
    WHEN 'FR:gulli' THEN 18
    WHEN 'FR:franceinfo' THEN 19
    WHEN 'FR:tf1seriesfilms' THEN 20
    WHEN 'FR:lequipe' THEN 21
    WHEN 'FR:6ter' THEN 22
    WHEN 'FR:rmcstory' THEN 23
    WHEN 'FR:rmcdecouverte' THEN 24
    WHEN 'FR:cherie25' THEN 25
    WHEN 'FR:lci' THEN 26
    -- France, les grandes payantes : apres la TNT, dans leur ordre de bouquet.
    WHEN 'FR:canal+cinema' THEN 101
    WHEN 'FR:canal+sport' THEN 102
    WHEN 'FR:canal+series' THEN 103
    WHEN 'FR:canal+docs' THEN 104
    WHEN 'FR:canal+kids' THEN 105
    WHEN 'FR:canal+foot' THEN 106
    WHEN 'FR:canal+boxoffice' THEN 107
    WHEN 'FR:canal+360' THEN 108
    WHEN 'FR:beinsports1' THEN 110
    WHEN 'FR:beinsports2' THEN 111
    WHEN 'FR:beinsports3' THEN 112
    WHEN 'FR:parispremiere' THEN 120
    WHEN 'FR:teva' THEN 121
    WHEN 'FR:histoire' THEN 122
    WHEN 'FR:13emerue' THEN 123
    WHEN 'FR:animaux' THEN 124
    WHEN 'FR:automoto' THEN 125
    WHEN 'FR:tv5monde' THEN 126

    -- Allemagne.
    WHEN 'DE:daserste' THEN 1
    WHEN 'DE:ard' THEN 1
    WHEN 'DE:zdf' THEN 2
    WHEN 'DE:rtl' THEN 3
    WHEN 'DE:sat1' THEN 4
    WHEN 'DE:prosieben' THEN 5
    WHEN 'DE:vox' THEN 6
    WHEN 'DE:kabeleins' THEN 7
    WHEN 'DE:rtl2' THEN 8
    WHEN 'DE:3sat' THEN 9
    WHEN 'DE:arte' THEN 10
    WHEN 'DE:zdfneo' THEN 11
    WHEN 'DE:ndr' THEN 12
    WHEN 'DE:wdr' THEN 13
    WHEN 'DE:br' THEN 14
    WHEN 'DE:phoenix' THEN 15
    WHEN 'DE:kika' THEN 16
    WHEN 'DE:ntv' THEN 17
    WHEN 'DE:welt' THEN 18
    WHEN 'DE:nitro' THEN 19
    WHEN 'DE:superrtl' THEN 20
    WHEN 'DE:sixx' THEN 21
    WHEN 'DE:sat1gold' THEN 22
    WHEN 'DE:tele5' THEN 23

    -- Italie.
    WHEN 'IT:rai1' THEN 1
    WHEN 'IT:rai2' THEN 2
    WHEN 'IT:rai3' THEN 3
    WHEN 'IT:rete4' THEN 4
    WHEN 'IT:canale5' THEN 5
    WHEN 'IT:italia1' THEN 6
    WHEN 'IT:la7' THEN 7
    WHEN 'IT:tv8' THEN 8
    WHEN 'IT:nove' THEN 9
    WHEN 'IT:rai4' THEN 10
    WHEN 'IT:rai5' THEN 11
    WHEN 'IT:raimovie' THEN 12
    WHEN 'IT:raipremium' THEN 13
    WHEN 'IT:iris' THEN 14
    WHEN 'IT:realtime' THEN 15

    -- Espagne.
    WHEN 'ES:la1' THEN 1
    WHEN 'ES:la2' THEN 2
    WHEN 'ES:antena3' THEN 3
    WHEN 'ES:cuatro' THEN 4
    WHEN 'ES:telecinco' THEN 5
    WHEN 'ES:lasexta' THEN 6
    WHEN 'ES:neox' THEN 7
    WHEN 'ES:nova' THEN 8
    WHEN 'ES:energy' THEN 9
    WHEN 'ES:fdf' THEN 10
    WHEN 'ES:divinity' THEN 11
    WHEN 'ES:bemad' THEN 12

    -- Royaume-Uni.
    WHEN 'UK:bbcone' THEN 1
    WHEN 'UK:bbctwo' THEN 2
    WHEN 'UK:itv1' THEN 3
    WHEN 'UK:itv' THEN 3
    WHEN 'UK:channel4' THEN 4
    WHEN 'UK:channel5' THEN 5
    WHEN 'UK:e4' THEN 6
    WHEN 'UK:film4' THEN 7
    WHEN 'UK:dave' THEN 8
    WHEN 'UK:skyone' THEN 9
    WHEN 'UK:bbcnews' THEN 10
    WHEN 'UK:skysportsmainevent' THEN 11

    ELSE NULL
  END
$$;--> statement-breakpoint

ALTER TABLE "streams" ADD COLUMN "channel_rank" integer
  GENERATED ALWAYS AS (public.channel_rank(name)) STORED;--> statement-breakpoint

-- Le tri du direct commence par la langue du profil, calculee a la volee, et
-- enchaine sur ce rang : l'index sert la seconde moitie du tri.
CREATE INDEX IF NOT EXISTS "streams_channel_rank_idx"
  ON "streams" ("type", "channel_rank") WHERE type = 'live' AND removed_at IS NULL;
