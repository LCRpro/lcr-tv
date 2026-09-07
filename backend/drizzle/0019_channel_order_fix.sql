-- L'ordre des chaines, corrige : le fournisseur n'ecrit pas les noms comme moi.
--
-- La premiere table verifiait chaque entree en cherchant le nom que je croyais
-- juste, et concluait « absente » quand elle ne le trouvait pas. C'etait une
-- verification qui ne verifiait rien : BBC One est bien la, elle s'appelle
-- « BBC 1 » ; RTL2 s'appelle « RTL ZWEI ». Le direct anglais s'ouvrait donc sur
-- ITV 1, sans les deux chaines que tout le pays regarde d'abord.
--
-- Cette table-ci part de l'inverse : la liste des noms **reellement presents**
-- dans le catalogue, relevee categorie par categorie, a qui on attribue ensuite
-- un rang. Une entree qui n'apparie rien ne coute rien, mais aucune chaine
-- presente ne doit rester sans rang par erreur d'orthographe.
--
-- La colonne generee ne se recalcule pas quand la fonction change : il faut la
-- reconstruire. C'est une reecriture de table d'une minute environ.
ALTER TABLE "streams" DROP COLUMN IF EXISTS "channel_rank";--> statement-breakpoint

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

    -- Royaume-Uni. Les cinq historiques d'abord, puis le reste de la TNT
    -- gratuite, puis le bouquet Sky. Noms releves dans le catalogue : le
    -- fournisseur ecrit « BBC 1 » et non « BBC One ».
    WHEN 'UK:bbc1' THEN 1
    WHEN 'UK:bbcone' THEN 1
    WHEN 'UK:bbc2' THEN 2
    WHEN 'UK:bbctwo' THEN 2
    WHEN 'UK:itv1' THEN 3
    WHEN 'UK:itv' THEN 3
    WHEN 'UK:channel4' THEN 4
    WHEN 'UK:channel5' THEN 5
    WHEN 'UK:itv2' THEN 6
    WHEN 'UK:bbc3' THEN 7
    WHEN 'UK:bbc4' THEN 9
    WHEN 'UK:itv3' THEN 10
    WHEN 'UK:quest' THEN 12
    WHEN 'UK:e4' THEN 13
    WHEN 'UK:itv4' THEN 14
    WHEN 'UK:more4' THEN 15
    WHEN 'UK:5star' THEN 17
    WHEN 'UK:5usa' THEN 18
    WHEN 'UK:drama' THEN 20
    WHEN 'UK:dave' THEN 21
    WHEN 'UK:4seven' THEN 22
    WHEN 'UK:yesterday' THEN 26
    WHEN 'UK:w' THEN 28
    WHEN 'UK:film4' THEN 30
    WHEN 'UK:bbcnews' THEN 231
    WHEN 'UK:skynews' THEN 232
    WHEN 'UK:skyone' THEN 301
    WHEN 'UK:skywitness' THEN 302
    WHEN 'UK:skyatlantic' THEN 303
    WHEN 'UK:skycomedy' THEN 304
    WHEN 'UK:skycrime' THEN 305
    WHEN 'UK:skydocumentaries' THEN 306
    WHEN 'UK:skyhistory' THEN 307
    WHEN 'UK:skynature' THEN 308
    WHEN 'UK:skysportsmainevent' THEN 310
    WHEN 'UK:skysportspremierleague' THEN 311
    WHEN 'UK:gold' THEN 320
    WHEN 'UK:alibi' THEN 321

    -- Allemagne. « RTL2 » s'ecrit « RTL ZWEI » chez ce fournisseur.
    WHEN 'DE:daserste' THEN 1
    WHEN 'DE:ard' THEN 1
    WHEN 'DE:zdf' THEN 2
    WHEN 'DE:rtl' THEN 3
    WHEN 'DE:sat1' THEN 4
    WHEN 'DE:prosieben' THEN 5
    WHEN 'DE:vox' THEN 6
    WHEN 'DE:kabeleins' THEN 7
    WHEN 'DE:rtlzwei' THEN 8
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
    WHEN 'IT:rainews24' THEN 16
    WHEN 'IT:raisport' THEN 17
    WHEN 'IT:italia2' THEN 18
    WHEN 'IT:raigulp' THEN 19
    WHEN 'IT:raiyoyo' THEN 20
    WHEN 'IT:raistoria' THEN 21
    WHEN 'IT:raiscuola' THEN 22

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
    WHEN 'ES:24htve' THEN 13
    WHEN 'ES:24horas' THEN 14

    ELSE NULL
  END
$$;--> statement-breakpoint

ALTER TABLE "streams" ADD COLUMN "channel_rank" integer
  GENERATED ALWAYS AS (public.channel_rank(name)) STORED;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "streams_channel_rank_idx"
  ON "streams" ("type", "channel_rank") WHERE type = 'live' AND removed_at IS NULL;
