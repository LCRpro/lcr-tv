# LCR TV

Consommation d'un abonnement **Xtream Codes** via une interface web et une application
mobile. Chaque compte apporte son propre abonnement et voit son propre catalogue ; chaque
compte se subdivise en profils, qui portent la liste, l'historique et la reprise de lecture.

Implémentation de [`SPEC-iptv.md`](SPEC-iptv.md). Les décisions d'architecture y sont
justifiées ; ce fichier explique comment faire tourner l'ensemble.

## Structure

```
backend/          Node 22, Fastify, Drizzle, Zod — API, sync, proxy de lecture
  src/xtream/     client Xtream typé en Zod, parseur XMLTV
  src/services/   providers, sync, auth, catalogue, slots, lecture, EPG, TMDB
  src/routes/     health, auth, profils, abonnements, catalogue, me, play, admin
  src/cli/        sync, provider, seed:admin, epg, tmdb
  tools/          faux panel Xtream pour développer sans consommer de connexion
web/              Next.js (App Router), hls.js
mobile/           Expo, expo-video, expo-secure-store
packages/shared/  types du catalogue et contrats d'API, importés par les deux fronts
docker/           init SQL (extensions unaccent et pg_trgm)
```

## Démarrage

Prérequis : Node 22, pnpm 9, Docker.

```bash
pnpm install
```

```bash
cp .env.example .env
```

Génère les deux secrets et colle-les dans `.env` :

```bash
node -e "const c=require('crypto');console.log('MASTER_KEY='+c.randomBytes(32).toString('hex'));console.log('TICKET_SECRET='+c.randomBytes(32).toString('hex'))"
```

Base de données (Postgres 16, exposé sur **5433** pour ne pas heurter une instance locale) :

```bash
pnpm db:up
```

```bash
pnpm --filter @iptv/shared build
```

```bash
pnpm --filter backend db:migrate
```

Premier administrateur. Les inscriptions sont ouvertes par défaut (`SIGNUP_MODE`), mais
l'administrateur est le seul à pouvoir gérer les comptes et les travaux de fond :

```bash
pnpm --filter backend seed:admin ton@email.fr "un-mot-de-passe-long"
```

Abonnement Xtream. Il appartient à un compte — sans `--user`, celui du premier
administrateur. On peut aussi l'ajouter depuis « Mes abonnements » dans l'application :

```bash
pnpm --filter backend provider add "Mon abo" http://hote:port UTILISATEUR MOTDEPASSE --activate
```

Premier remplissage du catalogue :

```bash
pnpm --filter backend sync
```

Puis les deux serveurs, dans deux terminaux :

```bash
pnpm dev:backend
```

```bash
pnpm dev:web
```

Le web écoute sur `http://localhost:3000`, l'API sur `http://localhost:3001`.

## Mobile

`mobile/app.json` porte `extra.apiUrl` : il doit pointer vers l'**IP de la machine hôte sur
le réseau local**, pas vers `localhost` — un téléphone ne joint pas le `localhost` du PC.

```bash
pnpm --filter mobile start
```

Pas de gestion des abonnements ni d'administration sur mobile, c'est délibéré : elles
demandent un clavier et des réglages fins qu'on ne fait pas à la télécommande. Le
sélecteur de profil, lui, est bien là.

## Développer sans consommer une connexion de l'abonnement

`backend/tools/mock-xtream.mjs` est un faux panel Xtream. Il imite les défauts des vrais
panels (entiers en chaînes, `false` à la place d'un tableau, champs absents, catégorie
adulte mélangée aux autres) et sert un manifest HLS à URIs relatives ainsi qu'une grille
XMLTV.

```bash
node backend/tools/mock-xtream.mjs 9010
```

```bash
pnpm --filter backend provider add "Mock local" http://localhost:9010 demo demo --activate
```

`MOCK_HIDE=201,301` retire des entrées du catalogue servi : utile pour vérifier que le sync
marque `removed_at` au lieu de supprimer.

## Commandes

| Commande | Effet |
|---|---|
| `pnpm --filter backend sync` | synchronise le catalogue (idempotent, interruptible) |
| `pnpm --filter backend sync --with-episodes` | précharge aussi les épisodes (lent : un appel par série) |
| `pnpm --filter backend epg` | importe la grille XMLTV |
| `pnpm --filter backend tmdb -- --limit 500` | enrichit les métadonnées depuis TMDB |
| `pnpm --filter backend provider list\|test\|activate\|deactivate\|remove` | gestion des abonnements |
| `pnpm --filter backend db:generate` | génère une migration depuis le schéma Drizzle |
| `pnpm -r typecheck` | vérifie les quatre paquets |

Un job quotidien à 4 h enchaîne sync → EPG → TMDB pour **tous** les abonnements de la
machine, et purge les sessions expirées. Chacun peut resynchroniser les siens depuis
« Mes abonnements » sans attendre. `/admin` ne garde que les comptes : les écrans globaux de
synchronisation, d'EPG et de lectures dupliquaient ce que chaque compte fait déjà chez lui.
Leurs routes existent toujours sous `/api/admin` — TMDB n'a pas d'autre déclencheur manuel.

## Points d'implémentation à connaître

**Chaque compte apporte ses abonnements.** `providers.user_id` est la clé de tout le
modèle. Les providers étaient globaux : un seul catalogue partagé, et les connexions
simultanées d'un abonnement prises par n'importe quel compte — ouvrir l'inscription dans
ces conditions revenait à distribuer sa place devant la télévision. Rattachés au compte,
un nouveau venu arrive avec son propre abonnement, voit son propre catalogue et consomme
ses propres connexions.

Le catalogue est déjà porté par `provider_id` sur `categories`, `streams`, `series` et
`epg_programmes` : l'isolation en découle sans toucher à ces tables. Elle tient à une seule
fonction, `activeProviders(userId)` dans `services/catalog.ts` — dix fragments SQL passent
par elle, et aucune requête de catalogue ne s'écrit sans.

**Un assouplissement assumé de la spec §5.1.** La règle disait « jamais renvoyés par
l'API même à un admin ». Elle a été écrite quand les abonnements étaient globaux : l'admin y
aurait lu ceux des autres. Depuis qu'ils appartiennent au compte,
`GET /api/providers/:id/credentials` les rend **à leur propriétaire** — pour corriger une
faute de frappe sans les retaper de mémoire. Ce que la règle garde : la route est séparée et
appelée au seul clic sur l'œil, jamais dans un listing (qui continue de masquer, `mo***er` /
`••••••••`) ; un abonnement d'autrui répond 404 ; et le masquage dans les logs est inchangé.

Corollaire : les abonnements ont quitté l'administration pour `/api/providers`. Un abonnement
d'autrui répond **`404 introuvable`**, jamais `403` : son existence même ne regarde pas celui
qui demande.

**Le verrou de synchronisation est par abonnement, pas par machine.** Il était unique : deux
comptes qui lançaient la leur en même temps se marchaient dessus, et le second recevait
« déjà en cours » alors qu'ils ne touchaient pas une seule ligne commune — les tables sont
partitionnées par `provider_id`. Ce qu'il fallait empêcher, c'est qu'un *même* abonnement
parte deux fois. Un plafond de trois exécutions simultanées reste posé : les lignes ne se
recouvrent pas, mais la connexion sortante et la base sont communes.

La place se réserve **avant le premier `await`**. Le verrou était posé après l'insertion en
base : entre le test et la pose, l'exécution rendait la main et un second appel traversait le
test — mesuré, deux lancements simultanés du même abonnement, zéro refus. Le défaut existait
déjà avec le verrou global ; il ne s'est vu qu'en écrivant le test de concurrence.

`getSyncStatus(userId)` est scopé de la même façon : un compte lisait la dernière exécution
de l'abonnement d'un autre et une volumétrie calculée sur toute la machine.

| | portée |
| --- | --- |
| `listActiveProviders(userId)` | les abonnements d'un compte — tout le catalogue |
| `listAllActiveProviders()` | toute la machine — planificateur, EPG, supervision |

**Ce qui reste à l'administration.** Presque plus rien : chaque compte est autonome. Le
même service sert les deux portées, l'identifiant de compte étant optionnel — omis, c'est
la vue machine.

| | compte (`/api/me`, `/api/providers`) | machine (`/api/admin`) |
| --- | --- | --- |
| Abonnements | les siens | — |
| Profils | les siens | — |
| Synchronisation | ses abonnements | nocturne, automatique |
| Grille TV (EPG) | ses abonnements, couverture sur ses chaînes | nocturne, automatique |
| Lectures en cours | les siennes, qu'il peut couper | — |
| Catégories adultes | son propre plafond | — |
| Comptes | — | créer, désactiver, promouvoir, consulter le détail |
| TMDB | — | clé API au niveau serveur |

Le plafond « catégories adultes » a changé de main : il était posé par un administrateur du
temps où le catalogue était commun, il se règle maintenant depuis `/compte`. Le décocher
referme **tous** les profils du compte — sinon un profil garderait un droit que son compte
n'accorde plus, et le rouvrir plus tard le lui rendrait sans que personne ne l'ait demandé.
`userUpdateSchema` ne le porte plus : deux écritures pour un même réglage se
contrediraient.

Couper une lecture demande d'en être le propriétaire (`killSlot(id, ownerId)`) : libérer la
connexion qu'un autre foyer utilise n'aurait aucun sens depuis que chacun paie la sienne.
La coupure sans `ownerId` reste, pour la supervision.

**Inscription.** `SIGNUP_MODE` vaut `open` (défaut), `code` ou `closed`. Ouverte par
défaut parce qu'un inscrit n'entame les connexions de personne ; passez à `code` dès que
l'application est joignable depuis l'extérieur. Le code est comparé en temps constant — un
`!==` laisse fuir sa longueur puis ses premiers caractères à qui mesure les temps de
réponse. Un compte créé est toujours ordinaire, toujours fermé aux catégories adultes, et
reçoit un profil d'emblée : sans lui, le nouveau venu arriverait sur un sélecteur vide.

`HomePayload` distingue deux vides. `noProvider` : rien à attendre, il faut ajouter un
abonnement. `catalogEmpty` : la synchronisation est en route, il suffit de patienter.
Afficher une barre de progression à qui vient de s'inscrire promettrait un catalogue qui
n'arrivera jamais.

**Un compte, plusieurs profils.** Le compte porte l'identité et les droits — il
s'authentifie, l'administrateur l'active, il consomme les connexions de l'abonnement. Le
profil porte les goûts : `favorites`, `favorite_categories` et `watch_progress` sont
rattachés à `profile_id`, **pas** à `user_id`. Sans cette séparation, tout le foyer
partageait une seule « Reprendre la lecture ».

Le profil choisi vit dans `sessions.profile_id` : recharger l'onglet ne redemande pas qui
regarde, et un autre appareil garde son propre choix. Tout le catalogue passe par
`viewerOf()` (`backend/src/plugins/auth.ts`), qui refuse en `409 NO_PROFILE` tant que la
question n'a pas de réponse — les routes `/api/profiles` sont les seules à ne pas l'exiger,
puisque c'est là qu'on répond.

L'accès adulte est l'**intersection** du compte et du profil :
`user.canWatchAdult && profile.canWatchAdult && !profile.isKid`. Le compte pose le plafond,
le profil ne peut qu'en retirer — sinon il suffirait de créer un profil de plus pour
contourner le réglage de l'administrateur.

**TMDB : un appel par œuvre, pas par ligne.** Le fournisseur publie le même film 3,26 fois
en moyenne — une ligne par langue et par qualité — et l'interface n'en montre qu'un
représentant. `distinct on (work_key)` trié par `lang_rank` retient le représentant français
quand il existe (c'est celui dont le titre a le plus de chances d'être reconnu, la recherche
étant faite en `fr-FR`), et le résultat est recopié sur toutes ses jumelles : même œuvre,
même synopsis, même affiche. 95 586 œuvres pour 311 904 lignes de films, 28 942 pour 99 340
lignes de séries.

Avant tout appel, une requête d'**héritage** recopie l'enrichissement sur les lignes neuves
d'une œuvre déjà connue. La grosse passe ne se fait qu'une fois, mais le catalogue se
resynchronise chaque nuit : sans elle, une déclinaison nouvelle d'un film déjà enrichi
repartait interroger TMDB pour une réponse déjà en base. Mesuré : 1 616 lignes remplies sans
un seul appel réseau. Le job nocturne ne dépense donc son quota que sur l'inédit.

Le nettoyage de titre passe par `splitLanguage` du paquet partagé et non par une liste
maison. Elle en connaissait treize — `FR|EN|IT|PT|…` — et « PL - Fifty Shades of Grey - 2015 »
partait tel quel à TMDB : **44 correspondances sur 100**, les échecs commençant tous par un
code absent de la liste. Avec les 76 codes du paquet : **94 sur 100**, mesuré sur trois lots.

**Recherche.** Trois colonnes générées, trois rôles distincts :

| colonne | contenu pour `FR - CANAL+ FHD ◉` | sert à |
| --- | --- | --- |
| `name_normalized` | `fr - canal+ fhd ◉` | compatibilité, listes |
| `search_name` | `canal+` | similarité trigramme, `like` |
| `tight_name` | `canal+` | paliers de correspondance |

`search_name` retire le préfixe de langue, la qualité, les décorations et les `#####` des
séparateurs. C'est ce qui a corrigé un classement inversé : mesuré sur le catalogue réel,
`canal +` donnait `similarity = 0,667` à `##### MX - CANAL #####` et `0,545` à
`GT - CANAL 3`, contre `0,500` seulement à `FR - CANAL+ FHD` — la similarité trigramme
favorise les noms courts, et le bruit du fournisseur allongeait les bons.

`tight_name` supprime espaces et ponctuation **sauf le `+`**, qui porte du sens dans les
noms de chaînes (CANAL+, M6+, Paramount+). On tape `canal +`, la chaîne s'appelle `CANAL+` ;
on tape `bein sport`, elle s'appelle `beIN SPORTS 1`. Sans cette forme, aucun test de
préfixe ne rapprochait les deux.

Le classement (`relevance()` dans `services/catalog.ts`) sépare d'abord le **fort** du
**faible** — le nom contient le terme cherché, ou pas — préfère le français dans le groupe
fort, et n'utilise le palier qu'ensuite. Trier par palier d'abord ne ramenait que des
chaînes étrangères sur `sport` (aucune chaîne française ne *commence* par ce mot) ; trier
par langue d'abord remonterait n'importe quel titre français approchant devant la
correspondance exacte, et `breaking bad` ne trouverait plus la série.

Les séparateurs du fournisseur sont exclus de la recherche comme ils le sont de la grille :
`##### MX - CANAL #####`, réduit à `canal` une fois nettoyé, arrivait premier.

Accents et fautes de frappe restent gérés sans code applicatif : `kamelot` trouve
`Kaamelott`, `evades` trouve `Les Évadés`.

**Attention aux templates `sql` de Drizzle** : les colonnes interpolées y sont rendues
**sans préfixe de table**. Dans une sous-requête corrélée, `${streams.categoryId} = ${categories.id}`
devient `"category_id" = "id"`, résolu entièrement sur la table interne — silencieusement faux.
Les sous-requêtes de ce dépôt écrivent donc les noms en clair avec un alias explicite.

**Lecture.** Une balise `<video>` et hls.js n'envoient pas de header `Authorization` sur les
segments : les routes de flux ne valident qu'un **ticket HMAC** (15 min, scopé à un item et à
un slot). Côté web le `.m3u8` est réécrit et les segments streamés par le backend ; côté
mobile une redirection 302 renvoie vers l'URL Xtream directe.

> Compromis assumé : ce 302 expose les identifiants du provider à qui inspecte le trafic de
> l'application mobile. Acceptable pour un cercle de proches. Sinon, passer `mode: 'proxy'`
> dans `mobile/app/player.tsx` et perdre l'économie de bande passante.

Les URLs de segment réécrites portent une signature HMAC : sans elle, la route de segment
accepterait n'importe quelle URL et servirait de relais ouvert. Il n'y a volontairement pas
de liste blanche d'hôtes — beaucoup de panels servent leurs segments depuis un CDN tiers.

**Films en `.mkv`.** Non lisibles en `<video>`. Le backend renvoie `415 UNPLAYABLE_IN_BROWSER`
avec le container, et l'interface invite à passer par le mobile. Pas de remux ffmpeg.

**Slots.** `max_connections` est lu depuis `user_info` au sync, jamais codé en dur. Un slot
est acquis avant toute lecture, sous verrou consultatif Postgres ; heartbeat client toutes
les 30 s, récupération à 90 s sans signal. Saturation → **409** nommant l'abonnement saturé
et l'utilisateur qui occupe la connexion, affiché tel quel côté client.

`GET /api/connections` expose l'occupation par abonnement à **tous** les comptes, pas
seulement aux admins : les deux fronts l'affichent en permanence dans la barre de navigation,
pour qu'on sache si une place est libre *avant* de lancer une lecture plutôt que de découvrir
un 409.

**Plusieurs abonnements peuvent être actifs simultanément.** C'est la seule divergence
assumée avec la spec, qui postulait un provider actif unique. Chaque abonnement apporte ses
propres connexions et elles s'additionnent : deux abonnements à une connexion permettent
deux lectures en parallèle. Les conséquences se paient à trois endroits, tous critiques :

- un slot appartient à **un** abonnement — c'est sa limite qui s'applique, pas un total ;
- l'URL de flux est construite avec les identifiants de l'abonnement **du contenu**. Prendre
  « le » provider actif fabriquerait une URL crédible pointant sur le mauvais compte ;
- sync, EPG et complétion des fiches bouclent sur les abonnements actifs, et chacun
  n'interroge jamais que son propre panel — les numérotations Xtream ne sont pas communes.

**Une fiche par œuvre, pas par déclinaison.** Le fournisseur publie le même film une
vingtaine de fois — une ligne par langue, par qualité, par variante de sous-titrage. Chercher
« Backrooms » sortait 24 résultats pour deux films. Deux colonnes générées par la base
règlent le problème :

- `work_key` = titre débarrassé du préfixe de langue, des mentions entre crochets et de
  l'année, plus l'année séparément. Deux titres identiques d'années différentes restent deux
  œuvres : « Dune 1984 » n'est pas « Dune 2021 » ;
- `lang_rank` classe les déclinaisons — le français représente l'œuvre s'il existe.

Les listes ne montrent qu'un représentant par `work_key` ; la fiche propose toutes les
déclinaisons, groupées par langue puis par version. Mesuré sur le catalogue réel :
155 880 lignes deviennent 95 526 œuvres, 49 640 séries en deviennent 28 927, sans fusion
abusive (« Joker 2019 » regroupe 25 langues, « Amityville Backrooms » reste distinct de
« Backrooms »).

L'extraction est écrite en SQL et non en TypeScript parce qu'elle alimente une colonne
générée : le regroupement affiché et le regroupement interrogé ne peuvent donc pas diverger.

Les séries suivent la même règle, avec une différence : changer de langue y change aussi la
liste des épisodes, chaque déclinaison étant une série distincte chez le fournisseur. La
fiche recharge donc celle qu'on choisit, sans naviguer, et repart de sa saison par défaut —
les numérotations ne se correspondent pas d'une déclinaison à l'autre.

Enfin, les titres d'épisodes répètent tout : « FR - Outer Banks [VOSTFR] - S01E01 - "Nothing
to Lose" ». Le nom de la série et le numéro figurant déjà à côté, seul le titre propre à
l'épisode est affiché. Le nettoyage rend le libellé d'origine s'il ne laisse rien
d'exploitable — mieux vaut verbeux que vide.

**Une vignette par chaîne, pas par qualité.** Même problème que la VOD, décalé : le
fournisseur publie « CANAL+ LIVE 1 » en FHD, HD, SD et HEVC, et la catégorie CANAL+ SPORTS
affichait 53 vignettes pour 26 chaînes réelles. Deux colonnes générées de plus :

- `quality_rank` classe les qualités par ce qui a le plus de chances de se lire — FHD, HD,
  sans marqueur, 4K, SD, puis **HEVC en dernier** : aucun navigateur ne décode le H.265, la
  variante ne doit jamais représenter le groupe par défaut ;
- `group_key` est la clé de regroupement effective, choisie selon le type de la ligne :
  `work_key` en VOD, `channel_key` en live.

La différence entre les deux comptait : **la langue d'une chaîne fait partie de son
identité** alors que celle d'un film n'en fait pas partie. `channel_key` conserve donc le
préfixe — « FR - CANAL+ 360 » et « PL - CANAL+ 360 » restent deux chaînes — là où `work_key`
le retire. Sans cette nuance, le sélecteur de qualité de CANAL+ 360 proposait un flux
polonais sous l'étiquette « HD ».

Validé sur le catalogue réel avant d'être écrit : les seuls groupes de plus de trois
membres sont de vraies déclinaisons (`LA SEXTA` en FHD/HD/HEVC/SD) ou des lignes vides du
fournisseur (`NO MATCH`, `NO EVENT`) ; `BEIN SPORTS 1` et `BEIN SPORTS 6` restent distinctes.
24 377 chaînes deviennent 21 043, et 134 groupes sur 12 601 pointent vers des identifiants
EPG différents — presque tous des erreurs de rattachement du fournisseur
(`CARTOONITO FHD → 01tv.fr`).

Les qualités se choisissent **dans le lecteur** : une chaîne n'a pas de fiche, on la lance
depuis la grille. `GET /api/live/:id` sert les déclinaisons, le programme en cours et le
suivant.

**Téléviseurs.** Le portage TV a son propre fil : [TV.md](TV.md). En deux mots — le web
couvre déjà les téléviseurs Android, Fire TV, LG et Samsung, qui ont un navigateur ; l'Apple
TV n'en a pas et demande une application tvOS, donc un Mac ou EAS Build. La couche TV
(focus, échelle 10 pieds, marge d'overscan) vit dans l'application mobile derrière
`Platform.isTV` : sur téléphone rien ne change.

**Une barre, pas un en-tête.** Les pages de catalogue ouvraient sur un surtitre, un grand
titre, une accroche et un filet : trois cents pixels avant le premier contenu, et un trait qui
coupait la page en deux. Tout tient maintenant sur une bande collée sous la navigation.

Le fond de la bande et son filet vivent dans **le même pseudo-élément**. Séparés, ils avaient
divergé : le fond débordait de 33 px de chaque côté pour couvrir toute la fenêtre, tandis que
le filet restait borné à la page — la ligne flottait à l'intérieur de sa propre bande. Le fond
est aussi devenu opaque : il finissait transparent sur son tiers inférieur, et les vignettes
défilaient visiblement au travers, juste au-dessus du filet.

La hauteur de la bande est une variable, `--bar-h`, lue à deux endroits : par la bande
elle-même et par la colonne de catégories qui se cale dessous. Les deux valeurs avaient été
écrites séparément, puis la bande est passée sur deux lignes sans que l'offset suive — le
champ « Filtrer les catégories » se retrouvait masqué de seize pixels au défilement.

La bande ne porte que **deux choses**, une à chaque bout : ce qu'on regarde — titre et nombre
de résultats — et de quoi le filtrer. Le choix d'affichage n'y est plus : il n'agit pas sur la
page mais sur les résultats, il vit donc juste au-dessus d'eux. Dans la bande, il pesait
autant que le titre.

Deux classes `.field` coexistaient : celle du champ de recherche et celle des champs de
formulaire de la page de connexion. La seconde arrivant plus loin dans la feuille, elle
l'emportait — toutes les recherches héritaient d'une disposition en colonne et d'une marge
basse de 15 px, qui décalait le champ de huit pixels vers le haut de sa barre. Les formulaires
sont passés à `.form-field`.

**Rien ne bouge d'une catégorie à l'autre.** Deux décalages dépendaient du nombre de chaînes,
et sautaient donc au changement de catégorie.

Le premier, vertical : la position **naturelle** de la colonne — juste sous la barre — et sa
position **collante** différaient de huit pixels. Une catégorie courte, dont le contenu ne
remplit pas la hauteur, laissait la colonne à sa position naturelle ; une catégorie longue la
collait huit pixels plus bas. L'écart sous la barre est devenu une variable, `--bar-gap`, lue
par la barre et par la colonne : les deux positions coïncident désormais.

Le second, horizontal : une catégorie courte tient dans l'écran, la barre de défilement
disparaît, et toute la page se décale de dix pixels. `scrollbar-gutter: stable` réserve la
gouttière en permanence.

Mesuré à 5, 26 et 82 chaînes : colonne à 128, champ à 128, grille à 172, bord droit à 1462 —
les mêmes valeurs dans les trois cas.

**La colonne de gauche ne bouge plus du tout.** Un élément collant placé dans une grille est
borné à sa **zone de grille**, pas au padding du conteneur : la marge de fin de page, posée
sur `.split`, tombait sous les rangées et ne lui servait à rien. Au tout dernier écran de
défilement, la colonne se faisait donc pousser de soixante pixels. La marge vit désormais dans
la colonne de résultats, qui est celle qui fixe la hauteur de la rangée — donc l'espace dans
lequel la colonne de gauche peut rester collée. Mesuré à six hauteurs de défilement, jusqu'au
bas de page : 128 px, toujours.

Sa hauteur est **imposée**, pas minimale : `height: var(--bar-h)`. Avec un simple minimum,
son contenu la faisait déborder à 80 px là où la variable en annonçait 62, et l'offset de la
colonne — calculé sur la même variable — décalait d'autant. Imposée, les deux ne peuvent plus
diverger. Le chrome total est passé de 156 à **116 px**.

La colonne de catégories a perdu sa carte : plus de fond, de bordure, de coins arrondis ni
d'ombre, seulement un filet vertical. Le panneau encadrait une liste qui n'en demandait pas et
donnait l'impression d'une fenêtre posée sur la page.

**Le direct ne se fige plus.** Le programme en cours arrivait avec la page et n'en bougeait
plus : à 21 h les vignettes annonçaient encore celui de 20 h, et la barre d'avancement restait
immobile. Un battement de 30 s fait avancer les barres, et une relecture serveur toutes les
deux minutes rafraîchit les titres. Rien ne tourne quand l'onglet est masqué — c'est du réseau
et du rendu pour un écran que personne ne regarde, et le retour de visibilité rattrape tout.

**La recherche couvre le programme.** Chercher « premier league » ne trouvait rien : aucune
chaîne ne s'appelle ainsi. « CANAL+ FOOT » la diffuse pourtant, et la grille le sait. Les
programmes sont filtrés **d'abord**, dans une sous-requête à part, pour que leur index
trigramme serve pleinement : posé au même niveau que le test sur le nom, le prédicat force un
parcours des 272 000 programmes par chaîne candidate — 374 ms mesurées, contre **68** sous
cette forme.

**Les séparateurs du fournisseur sont masqués.** Il insère des intitulés décoratifs dans sa
liste de chaînes : `##### DAZN EVENEMENT PPV #####`. Ce ne sont pas des chaînes — 1 102 sur
24 542 vignettes, et sur ces 1 102, **sept** portent un identifiant EPG et **trois** un
programme. Masqués et non supprimés : la règle est une heuristique sur le nom, et une chaîne
réelle mal nommée doit rester rattrapable — `?separators=1` les réaffiche.

**Une `Date` ne s'interpole pas dans un template `sql`.** La grille horaire remontait vide sur
toutes les chaînes, alors que la vue liste affichait bien leurs programmes. La requête levait
« Received an instance of Date » : interpolée dans un template brut, une date JS n'est pas liée
comme un timestamp et le pilote la refuse. Les bornes passent désormais par les opérateurs
typés `lt` / `gt`. `nowPlayingFor` y échappait parce qu'il ne compare qu'à `now()`, sans
valeur venue du client.

Dans la grille, les chaînes qui ont un programme passent devant : le fournisseur n'en publie
que pour 17 % du catalogue, et six lignes utiles se noyaient sous trente-quatre « pas de
grille ». C'est la seule vue où cet ordre se justifie — elle n'existe que pour lire des
horaires. Un compteur « X / Y avec grille » évite de prendre cette rareté pour une panne.

**Trois affichages.** La vignette montre le logo, ce qui aide quand les chaînes se distinguent
à l'œil. La liste en affiche trois fois plus et donne la place au programme en cours : elle
vaut mieux dans une catégorie où quarante chaînes partagent le même logo, où celui-ci ne
distingue rien. La **grille horaire** — une ligne par chaîne, le temps en abscisse — montre ce
qu'aucune des deux autres ne dit : elles répondent « qu'est-ce qui passe maintenant », pas
« qu'est-ce qui passe à 21 h ». Elle n'existe que sur le direct, et sa requête ne coûte que
3 ms pour une page de quarante chaînes. Le choix est retenu d'une visite à l'autre — c'est une préférence de lecture — mais il
ne va pas dans l'URL : on ne partage pas « en liste », on partage une catégorie.

**Le contenu prime sur l'étiquette.** « EU | FR | UFC INTERNATIONAL » annonce du français
alors que ses 62 chaînes sont toutes en « US - … ». Quand au moins trois quarts des contenus
d'une catégorie s'accordent sur une même langue, c'est elle qui fait foi, pas le préfixe du
fournisseur. Mesuré : 73 catégories sur 367 changent, et toutes y gagnent — « AM | USA | ABC »
portait le globe des Amériques, elle porte désormais le drapeau américain. Une seule catégorie
française quitte son groupe, et c'est précisément UFC INTERNATIONAL.

**Icônes dessinées, drapeaux exceptés.** Les emoji dépendent d'une police que le système
peut ne pas avoir, n'ont ni la graisse ni la couleur des autres tracés, et changent de dessin
d'un appareil à l'autre. Tous les repères de thème, le globe des marqueurs régionaux, la
bibliothèque, l'étoile et le bouton de lecture sont donc des tracés en `currentColor` sur la
même grille de 24 — SVG sur le web, `@expo/vector-icons` sur mobile, qui était déjà une
dépendance.

Les **drapeaux restent des emoji** : c'est le seul cas où l'emoji *est* l'icône. Dessiner à la
main les soixante pays du catalogue les rendrait tous approximatifs — le Canada, le Brésil, le
Royaume-Uni ou l'Albanie ne se réduisent pas à des bandes.

Conséquence sur les types : `LanguageTag.flag` devient nullable — « Afrique », « Asie »,
« Multilingue » ne désignent aucun pays — et `categoryIcon` renvoie une union
`flag | topic | globe` plutôt qu'un glyphe. Le front décide du rendu, le module partagé ne
transporte plus de caractère d'affichage.

**Une icône par catégorie.** Sur 625 catégories, 127 n'affichaient rien : le fournisseur
écrit souvent le pays en toutes lettres (`EU | CZECH REPUBLIC`, `AS | NEW ZEALAND`) ou le
range en fin de crochet (`VOD | FILMAT SHQIPTAR [ALB]`), deux formes que `splitLanguage` ne
lisait pas. Les tables couvrent maintenant ces graphies et les langues régionales de l'Inde ;
il reste 20 libellés qui ne relèvent d'aucune langue — `VIP | LA LIGA`, `VOD | IMDB TOP 500`.

Leur coller un drapeau serait faux : la Premier League n'est pas plus anglaise qu'un catalogue
Netflix n'est américain. `categoryIcon` leur donne donc un repère de **thème** (⚽, 🏎️, 🎬,
🎵…), et un écran neutre pour les trois qui n'en ont pas non plus. La table de thèmes reste
courte volontairement : au-delà, on invente des symboles pour des libellés qu'on n'a pas lus.

**Direction artistique.** Le rouge servait à tout — accent, sélection, boutons, direct — il
ne signifiait donc plus rien, et il entrait en concurrence avec les logos de chaînes, rouges
une fois sur deux. Il est désormais **réservé au direct** : un point rouge veut dire « ça
passe maintenant », nulle part ailleurs. L'accent est un **cyan glacial** (`#22d3ee`) :
affiches et logos de chaînes tirent presque tous vers le chaud, et une couleur froide et
saturée est la seule qui reste lisible par-dessus sans se confondre avec le contenu. L'or
reste aux notes. Le fond quitte le noir pur pour un bleu-nuit désaturé, qui laisse respirer
les affiches au lieu de les découper.

Le cyan est clair : il ne porte **jamais** de texte blanc, qui y tomberait à 1,7:1. Tout ce
qui s'écrit dessus prend `--on-accent` (`#042630`), une encre profonde de la même famille —
`colors.onAccent` côté mobile. Le vert d'état (`--ok`) a été tiré vers le jaune pour la même
raison : un vert d'eau à côté d'un accent cyan se lisait comme une nuance de l'accent, et
« Disponible » ne se distinguait plus d'un élément sélectionné.

**Navigation.** Chaque route porte un `loading.tsx`. Sans lui, cliquer un onglet ne
produisait rien pendant une à trois secondes : l'écran restait sur la page précédente et le
clic semblait perdu. En développement, l'essentiel de cette attente est la compilation à la
demande de Next — 0,5 à 1,4 s par route au premier passage, 50 ms ensuite, mesuré dans ses
logs. Elle n'existe pas en production ; l'attente du chargement des données, si. Le
`loading.tsx` s'affiche dès le clic, avant même que le code de la page existe, et le trait
de `NavProgress` couvre l'instant d'avant.

**Chargement.** Aucun écran n'affiche un rond qui tourne au milieu du vide : il ne dit ni ce
qui arrive ni combien de temps ça prendra, et la page saute au moment où le contenu le
remplace. Les squelettes (`SkeletonGrid`, `SkeletonList`, `SkeletonBrowse`, `SkeletonHome`)
occupent la place **exacte** des vignettes à venir, format d'affiche compris, si bien que
rien ne bouge à l'arrivée des données. Le premier écran, avant même de savoir qui regarde,
est la marque animée (`Boot`) — trop court pour lire une phrase, assez long pour qu'un écran
noir vide passe pour une panne.

Deux familles typographiques, deux rôles : **Sora** pour les titres et la marque, dont les
formes géométriques donnent un caractère que `system-ui` n'a pas mais qui fatigue sur un
paragraphe ; **Inter** pour tout le reste. Les deux sont servies depuis notre domaine par
`next/font`. Le mobile partage les mêmes valeurs de palette, aux mêmes hexadécimaux.

**Favoris.** Deux objets distincts, deux mécaniques.

Une **chaîne** est un `stream` : elle passe par la table `favorites` existante. Mais le
favori porte sur la ligne mise en favori, qui n'est pas forcément le représentant retenu par
la déduplication — mettre « FR - TF1 FHD » en favori puis voir la grille afficher
« FR - TF1 HD » ferait disparaître l'étoile. Le test porte donc sur tout le `group_key`.

Une **catégorie** a sa propre table `favorite_categories` (migration 0008) plutôt qu'une
valeur de plus dans `item_type` : cet enum est partagé avec `watch_progress`, où une
catégorie n'aurait aucun sens — on ne reprend pas une catégorie là où on l'avait laissée. Une
catégorie épinglée n'a ni progression, ni libellé à reconstituer, ni image. Son état voyage
avec `/api/categories/:type`, la barre latérale n'a donc rien de plus à charger, et les
épinglées passent devant tout le reste, français compris : un choix explicite prime sur un
défaut.

L'étoile vaut pour les trois catalogues. Elle n'existait d'abord que sur les chaînes : « Mes
films » et « Mes séries » comptaient et filtraient déjà, mais on ne pouvait ajouter que depuis
la fiche. Une série se met en favori comme `series`, un film comme `stream` — et dans les deux
cas la comparaison porte sur le groupe, pas sur l'identifiant, pour la même raison qu'ailleurs.

Le filtre « Mes chaînes » est un paramètre du listing (`?favorites=1`) et non un endpoint à
part : il hérite ainsi de la pagination, du tri et de la recherche.

Côté interface, l'étoile est toujours **à côté** de sa cible et jamais dedans — la vignette et
la ligne de catégorie sont déjà des boutons, et imbriquer une commande dans une autre est
invalide en HTML : le clic serait ambigu et le clavier n'atteindrait jamais l'étoile. Les
bascules s'appliquent à l'écran avant la réponse du serveur, et rechargent en cas d'échec.

**Ordre naturel.** Un tri texte compare les chiffres caractère par caractère et intercale
« LIGUE 1+ 10 » entre « 1 » et « 2 ». La collation ICU `public.natural` (locale `fr-u-kn`,
migration 0007) compare les suites de chiffres comme des nombres. Elle s'applique aux trois
listings, aux déclinaisons d'une œuvre, aux qualités d'une chaîne et au tri des catégories —
qui passe par `localeCompare(..., { numeric: true })` pour rester le pendant exact du SQL.
Coût mesuré sans index dédié : +15 ms en live, +30 en VOD.

**Quatre ordres, deux défauts.** Une chaîne ne « sort » pas : on la cherche par son nom, d'où
l'alphabétique en direct. Un film, si — et un catalogue de 95 000 titres trié par nom montre
éternellement les mêmes en tête, jamais les nouveautés. Films et séries s'ouvrent donc sur les
**ajouts les plus récents**.

L'ordre `recent` garde le rang de langue devant la date. Dans une catégorie, il ne départage
rien : les **156** catégories de films sont à plus de 75 % d'une seule langue, 154 à plus de
90 %, donc l'ordre y est bien celui de la date. Il ne joue que sur « toutes les catégories »,
où une récence pure noierait le français sous les ajouts anglophones du jour. L'ordre `added`
reste une récence pure, toutes langues mêlées : c'est la cible des liens « Tout voir » des
rangées de nouveautés.

**L'ordre n'est plus un réglage.** Le sélecteur « Français d'abord / Nom / Récents » a été
retiré : proposer trois ordres revenait à demander à l'utilisateur de réparer un défaut de
tri. Le français passe devant, partout, y compris pendant une recherche. Le paramètre d'URL
`?sort=added` reste lu — les liens « Tout voir » des rangées de nouveautés s'en servent —
mais rien ne l'expose.

En recherche, la préférence s'applique **après** la pertinence et non avant : la similarité
est arrondie au dixième pour former des paliers, et le français ne passe devant qu'à qualité
de correspondance comparable. L'inverse aurait remonté n'importe quel titre français devant
la correspondance exacte cherchée.

**Survol des cartes.** La carte sautait de six pixels, l'affiche zoomait, un voile noir
tombait et le titre changeait de couleur : quatre effets pour une seule intention, et une
grille entière qui tressautait au passage du curseur. Il ne reste que ce qui sert — un liseré
d'accent qui dit ce qui est visé, un voile léger, et le bouton de lecture qui dit ce qu'un
clic va faire.

**Logo de catégorie.** Les 33 chaînes de « AHL » portent toutes celui de la ligue : le
drapeau américain n'y apprend rien, le logo si. Celles de « GÉNÉRAL » n'ont rien en commun,
et prendre la première afficherait un logo arbitraire pour toute la catégorie. Le serveur ne
renvoie donc le logo majoritaire que s'il couvre **au moins trois quarts** des chaînes.
Mesuré : AHL 97 %, NHL 96 %, Apple TV 98 %, Disney+ 95 % passent ; GENERAL 5 à 39 % et
CINÉMA 10 % gardent leur drapeau. Live uniquement — une catégorie de films n'a que des
affiches, en prendre une au hasard ne voudrait rien dire. Une passe groupée, 48 ms.

**Vignette de chaîne.** Le nom est posé **sur** la vignette, pas dessous. Le logo ne distingue
rien quand une catégorie entière le partage : la grille devenait un mur de tuiles identiques
dont seule la légende minuscule changeait. Le nom devient donc l'élément principal, tronqué à
deux lignes, et le logo son décor. Le troncage vit sur une enveloppe de texte et non sur son
parent : `-webkit-box` compte chaque enfant comme une ligne, et le drapeau consommait à lui
seul la première des deux.

**Structure de page.** Chaque page ouvre sur le même bloc `PageHead` — surtitre, titre, une
ligne de contexte, et le compteur de résultats présenté comme une donnée. Auparavant un
`<h1>` nu flottait au-dessus des filtres et rien ne séparait le haut de page du contenu.

Les filtres sont **collants sous l'en-tête** : sur une grille de plusieurs milliers d'entrées,
remonter en haut pour changer un tri n'a pas de sens. Le menu déroulant devient un contrôle
segmenté — trois options se lisent d'un coup d'œil, et l'ordre courant reste visible sans
rien ouvrir. La colonne de gauche se cale sous cette barre, sinon les deux se recouvrent.

**Colonne de catégories.** Elle porte 388 entrées : elle a maintenant sa propre tête fixe avec
un champ de filtre, et seule la liste défile. Le compte devient une pastille — il cessait de
se lire comme la fin du nom — et l'entrée active se signale par une barre d'accent à gauche
plutôt que par un aplat, qui faisait un pavé de couleur au milieu d'une liste sombre.

**Français d'abord.** Tri par défaut des trois listings et de la barre de catégories. Sur
24 542 chaînes dont 1 372 françaises, l'alphabétique brut enterrait le français entre
l'albanais et l'arabe ; la page s'ouvrait sur `### CAMBODIA ###`. Deux mécanismes, une seule
règle :

- **grilles** : `sort=fr` ordonne par `lang_rank` puis par nom. La colonne était déjà
  calculée et indexée — elle sert à choisir le représentant d'une œuvre — donc le tri ne
  coûte rien (70 ms en live). `sort=name` et `sort=added` restent disponibles dans le menu ;
- **catégories** : triées côté service et non en SQL, parce que leurs noms empilent plusieurs
  segments (`EU | FR | CANAL+ SPORTS`) que seule `splitLanguage` sait lire — la même fonction
  qui choisit le drapeau affiché à côté, donc l'ordre et le drapeau ne peuvent pas diverger.

Le tri secondaire porte sur le **libellé affiché**, pas sur le nom brut : trier sur le nom
brut rangeait la liste par préfixe de région, ce qui, pour qui ne voit que le libellé, se
lisait comme un ordre aléatoire. La coupure entre « Français » et « Autres langues » est
matérialisée dans la barre latérale, sans quoi une liste qui enchaîne dix-sept entrées
françaises puis repart à « Afrique » ressemble à un tri cassé.

**Compteurs de catégories.** Ils appliquent la même déduplication que le listing, sinon la
barre latérale annonce 53 chaînes là où la grille en montre 26. La sous-requête corrélée
d'origine devenait injouable une fois le prédicat ajouté (59 s) : le compteur est donc une
**passe groupée unique** jointe côté service — 70 ms en live, 157 ms en VOD, 53 ms en séries.

**Lecteur web.** Habillage entièrement redessiné plutôt que les contrôles natifs du
navigateur, qui ne connaissent ni le direct, ni les qualités disponibles, ni la langue de
l'interface. Barre de progression scrubbable en VOD, avancement du programme en cours en
direct, volume mémorisé, plein écran, Picture-in-Picture, raccourcis (espace, ←/→, ↑/↓, `m`,
`f`, Échap) et effacement automatique de l'habillage après 2,8 s d'inaction.

Deux pièges corrigés au passage :

- **hls.js d'abord, lecture native ensuite.** `canPlayType('application/vnd.apple.mpegurl')`
  répond « maybe » sur des navigateurs qui ne savent pas démuxer un MPEG-TS ; leur faire
  confiance donnait un écran noir et un `DEMUXER_ERROR_COULD_NOT_PARSE`. hls.js fonctionne
  partout où Media Source Extensions existe, c'est-à-dire partout sauf iOS — où la lecture
  native est justement la bonne réponse.
- **Une panne de flux s'affiche.** Le panel peut accorder une lecture que la source refuse
  ensuite de servir. Au-delà de trois erreurs réseau fatales, le lecteur le dit et propose
  les autres qualités de la chaîne, au lieu de tourner indéfiniment sur un écran noir.

Changer de qualité **libère le slot avant** de redemander la lecture, et attend la réponse :
avec un abonnement à une seule connexion, demander la nouvelle qualité pendant que l'ancienne
tient encore le slot échouerait sur sa propre lecture.

**Drapeaux.** Windows n'embarque aucune police couvrant les indicateurs régionaux : Chrome y
affiche « FR » en petites capitales, c'est-à-dire exactement le code que le drapeau devait
remplacer. `next/font` charge Noto Color Emoji depuis notre propre domaine, et la classe
`.flag` est le seul endroit qui l'utilise — le reste de l'interface garde la police système.

**Déduplication et bascule.** Deux comptes chez un même fournisseur exposent le même
catalogue avec les mêmes `xtream_id` : l'appariement entre abonnements est donc exact, sans
heuristique de titre ni recours à TMDB. Deux conséquences :

- les listes ne montrent qu'un exemplaire de chaque contenu — celui du plus petit
  identifiant d'abonnement actif qui le possède, arbitraire mais stable ;
- à la lecture, si cet abonnement est saturé, le serveur **bascule automatiquement** sur un
  exemplaire équivalent chez un autre abonnement. C'est ce qui permet à deux personnes de
  regarder deux choses différentes avec deux abonnements à une connexion.

Le slot et la progression restent rattachés à l'item **demandé**, jamais à la source
réellement utilisée : changer de source ne doit pas créer un second historique pour le même
film. Seul le ticket porte la source, puisque c'est lui qui construit l'URL.

Le prédicat de déduplication est un `not exists` et non un `distinct on`, pour garder l'ordre
de tri libre et ne l'évaluer que sur les lignes réellement renvoyées.

**Catalogue.** Jamais de `DELETE` : les entrées disparues du panel sont marquées `removed_at`,
sinon favoris et historique sauteraient au premier remaniement du fournisseur.

En contrepartie, des providers désactivés cohabitent en base avec les actifs. Les listes, la
recherche et les rangées d'accueil sont donc filtrées sur les **abonnements actifs** ; les
lignes des autres restent stockées pour que favoris et historique y survivent, mais elles ne
sont plus parcourables. Une tentative de lecture sur l'une d'elles est refusée explicitement
plutôt que de fabriquer une URL avec les identifiants d'un abonnement actif et un identifiant
Xtream qui ne lui correspond pas.

**L'accueil met une œuvre en avant, pas une catégorie.** Il s'ouvrait sur une rangée de
vignettes de 164 px, exactement la même que les pages de parcours, et la première chose qu'on
y lisait était un nom de catégorie du fournisseur. `spotlight()` (`services/catalog.ts`) tire
cinq œuvres d'un vivier commun aux films et aux séries : celles qui portent une **image large
et un synopsis d'au moins soixante caractères**, seules capables de tenir un grand bloc — le
reste du catalogue n'a qu'une affiche de 300 px, illisible étirée.

Trois choix méritent d'être connus :

- **un tirage par famille, puis une alternance.** Le vivier compte 1 851 séries françaises
  pour 30 films — le fournisseur publie les images larges des séries, celles des films ne
  viennent que de l'enrichissement TMDB. Un tirage unique ne sortait donc que des séries, cinq
  fois sur cinq. Chaque famille classe les siennes de son côté et l'alternance les entrelace ;
  si l'une est vide, l'autre remplit tout ;
- **le tirage est semé par la date** (`md5(kind || id || '2026-09-01')`). La sélection change
  chaque matin et ne bouge plus de la journée ; un tirage réellement aléatoire changeait à
  chaque navigation, et revenir à l'accueil après un film ne ramenait jamais ce qu'on venait
  d'y voir ;
- **les visuels hébergés par TMDB passent devant.** Le fournisseur en héberge aussi, sur ses
  propres domaines, et un sur deux ne répond plus — la mise en avant tombait alors sur un
  cadre noir. Ils restent dans le vivier, en dernier recours pour un abonnement qui n'aurait
  que ceux-là. Côté front, une image qui échoue **sort sa proposition du tour** ;
- **rien n'est filtré sur la langue**, seulement ordonné : le français d'abord, puis les
  ajouts récents. Filtrer aurait vidé la mise en avant chez un abonnement sans catalogue
  français.

Les rangées suivent : reprendre, ma liste, ce qui passe en ce moment sur les chaînes
épinglées, les ajouts récents, les catégories, puis le direct. Ces deux dernières rangées de
chaînes portent le **programme en cours** : la liste de noms de catégories qui tenait cette
place ne répondait pas à « qu'est-ce qu'il y a à la télé », elle demandait de cliquer pour le
savoir. La seconde **ne retire pas** les épinglées. Elle l'a fait un temps, pour éviter de montrer
TF1 deux fois : mettre TF1 en favori la faisait alors disparaître de sous le curseur, et on
croyait l'avoir perdue. Une liste de chaînes qui saute des numéros n'est plus une liste de
chaînes — l'étoile ne retire rien de la grille, elle ajoute un raccourci au-dessus.

Chaque vignette de l'accueil porte son étoile. Les listings marquaient leurs favoris
eux-mêmes, mais les rangées d'accueil venaient de requêtes qui l'ignoraient : on ne pouvait
rien ajouter à sa liste depuis la page qui en montre le plus. `markFavorites()` le fait en
deux requêtes pour l'écran entier, en comparant **par groupe** — la ligne mise en favori n'est
pas forcément le représentant que la rangée affiche.

« Reprendre » et « Ma liste » ont la leur aussi, avec deux nuances. Sur « Reprendre »,
l'étoile porte sur l'**œuvre** et non sur l'épisode en cours : reprendre l'épisode 3, c'est
avoir la série en liste ou non — un épisode ne se met pas de côté tout seul. Sur « Ma liste »,
l'étoile retire, et la vignette part avec elle : une vignette qui resterait dans « Ma liste »
avec une étoile éteinte dirait deux choses contraires. `homeRows()` ne les choisit plus sur le
seul volume — les six plus grosses donnaient « ITALY », « PORTUGAL », « TURKISH » et
« MULTI-LANG », un accueil qui ne parlait la langue de personne ici. L'ordre est celui de la
colonne de gauche, déjà connu de l'utilisateur : ce qu'il a épinglé, le français, le reste.

Deux règles évitent que la page se répète :

- **le contenu d'une rangée de catégorie est tiré au sort une fois par jour**, avec la même
  graine que la mise en avant, et non pris dans l'ordre des ajouts. Trié par date, la
  première catégorie — « LATEST MOVIES » chez ce fournisseur — reprenait **exactement** les
  mêmes vignettes que la rangée « films récemment ajoutés » juste au-dessus. Au passage, une
  catégorie de 12 586 films n'en montrait que les vingt derniers, les mêmes pendant des
  semaines ;
- **une œuvre ne paraît qu'une fois.** La route retire des rangées de catégorie ce que les
  rangées d'ajouts récents montrent déjà, et supprime une rangée tombée sous six titres
  plutôt que de l'afficher en moignon. Le tirage rend la collision rare, ce filet la rend
  impossible.

**Un bloc de recherche vit sur l'accueil**, sous la mise en avant. Le champ de la barre de
navigation est étroit et gris : il se voit quand on le cherche, pas quand on arrive.
`QuickSearch` prend un `variant` — `nav` ou `page` — plutôt que d'exister en deux
exemplaires : l'alternance entre familles de résultats, le décompte du « voir tous les
résultats » et le panneau qui garde sa hauteur pendant le chargement ne se réécrivent pas
deux fois. Le champ occupe toute la largeur de la plaque ; le panneau de suggestions, lui, s'arrête à
une largeur de lecture — cinq résultats étalés sur 1 600 px laissaient un vide d'un mètre à
droite de chaque titre.

Les rangées « récemment ajoutés » placent enfin **le français devant, la fraîcheur ensuite**.
Le fournisseur publie huit fois plus d'étranger que de français — 11 116 séries françaises
contre 88 224 autres — et la rangée des séries ne sortait que du turc, de l'arabe et de
l'anglais au milieu d'un accueil entièrement français. Un ordre et non un filtre : un
abonnement sans catalogue français garde une rangée pleine.

**La recherche se classe par pertinence, pas par famille.** Les trois familles répondaient
chacune de leur côté et le front les **alternait** : film, série, chaîne, film, série… Le
résultat était que chercher « toy story » sortait *Boat Story* en deuxième position, avant
*Toy Story 2*, simplement parce que c'était le tour des séries. Et « bein sport » ouvrait sur
*BT Sport Race 16*.

Le palier de correspondance voyage désormais avec chaque résultat (`matchTier`, 0 à 3 : le nom
commence par le terme / un mot en tête / le terme apparaît ailleurs / simple ressemblance de
trigramme). Le front alterne toujours entre familles, mais **à l'intérieur d'un palier** : il
ne descend d'un cran que lorsque plus aucune famille n'a mieux à proposer.

| requête | avant | après |
|---|---|---|
| toy story | Toy Story 1995, *Boat Story*, *RMC Story*, Toy Story 4 | Toy Story 1995, 2, 3, 4, 5 |
| bein sport | *BT Sport Race 16*, *Bad Sport* | beIN SPORTS 1, 2, 3, MAX 4… |
| breaking bad | — | la série, la chaîne, puis El Camino |

Deux corrections l'accompagnent. Le dernier départ d'égalité est **l'ordre naturel** et non
l'identifiant : « Toy Story 2 », « 3 » et « 4 » ont le même palier, la même langue, la même
similarité et la même longueur, et la suite sortait dans le désordre — 4, puis 5, puis 2. Et
**les pages de parcours trient enfin par pertinence quand on y cherche** : le filtre trigramme
faisait son travail, mais l'ordre restait celui de la liste complète.

La page `/search` a été refaite dans la grammaire du reste : la barre commune avec son champ,
un choix segmenté à compteurs, et un bloc par famille — **rangés par la qualité de ce qu'ils
ont trouvé**. « bein sport » ouvre donc sur les chaînes et « toy story » sur les films, là où
un ordre fixe imposait de descendre trois écrans de vagues ressemblances. Une famille sans
résultat disparaît plutôt que d'afficher « aucun résultat » sur la hauteur d'une réponse.

**Une image manquante garde son cadre.** Le fournisseur n'en donne pas pour tout, et les
adresses qu'il donne meurent : la vignette restait un rectangle vide, et une liste de
suggestions ressemblait à une liste à moitié chargée. `NoImage` remplit ce cadre partout où il
peut être vide — suggestions, grilles, listes, historique, reprise, affiches de fiche, images
d'épisode. Trois de ces endroits n'avaient aucun repli, et les trois qui en avaient un le
dessinaient chacun à leur façon.

Ce sont **les initiales** et non un logo répété : un même visuel sur chaque entrée sans image
en ferait un mur de marques identiques, impossible à parcourir de l'œil, alors que « TS3 »
distingue *Toy Story 3* de son voisin. La marque de l'application les surmonte, en filigrane —
elle dit d'où vient le cadre sans leur disputer la place, et disparaît sous 64 px de large où
l'empilement écraserait les deux.

Deux pièges de mise en page valaient d'être notés. La marque est un **SVG** et non trois barres
masquées en CSS comme dans la barre de navigation : la pile de masques rendait un tout autre
dessin selon le moteur. Et le repli **ne se dimensionne pas lui-même** — il reçoit la classe de
cadrage de ce qu'il remplace, qui porte déjà largeur et rapport ; un `width: 100%` imposé
faisait de l'image d'épisode, large de 132 px, toute la largeur de sa ligne.

**Trois détails de vignette.** La vignette d'une suggestion était haute de 46 px pour 34 de
large : une affiche, qui est un 2/3, s'y faisait rogner d'un dixième en haut et en bas — assez
pour couper un visage ou le titre imprimé dessus. À 51 px, le cadrage ne retire plus rien à une
affiche bien formée.

**Et deux dans la grille.** Le titre portait le troncage à deux lignes dans un `span`
posé **à côté** du drapeau, dans un conteneur `flex` : la deuxième ligne repartait alors sous
la première lettre du titre au lieu de revenir à la marge, et chaque carte perdait quinze
pixels de largeur utile par ligne. Le drapeau est maintenant un élément en ligne **dans** la
boîte tronquée, que le texte enjambe. La note, elle, était calée à droite, là où se pose aussi
l'étoile de favori : il avait fallu la décaler de 42 px quand les deux se rencontraient, si
bien qu'une grille où quelques vignettes seulement sont en liste alignait des notes à deux
marges différentes. Centrée en haut de l'affiche, elle n'a plus de voisin.

**Le panneau de recherche de l'accueil prend toute la largeur, sur deux colonnes** — et dix
réponses au lieu de cinq. Il s'arrêtait à 640 px calé à gauche, pendant sous le tiers gauche
d'un champ qui tient toute la page, comme s'il appartenait à autre chose. Une seule colonne
sous 700 px, où deux coupaient chaque titre au troisième mot.

**Le direct suit l'ordre de la télécommande.** Il était trié par ordre alphabétique du nom :
« 6TER », « 13EME RUE », « 20 MINUTES TV », « A LA CARTE 1 »… et TF1 quelque part au milieu.
Personne ne cherche une chaîne à son initiale, on la cherche à sa place.

`channel_rank`, colonne générée, porte la numérotation du pays — TNT en France, l'équivalent
en Allemagne, Italie, Espagne et Royaume-Uni. La table est volontairement courte : elle couvre
les généralistes et les grandes chaînes payantes, c'est-à-dire ce qui se numérote vraiment.
Au-delà, un ordre inventé serait moins utile qu'un ordre alphabétique, parce qu'il serait faux
— la longue traîne thématique et régionale garde donc l'alphabet, derrière. Chaque entrée a
été vérifiée présente dans le catalogue avant d'être écrite ; celles qui ne le sont pas ne
coûtent rien, elles n'apparient jamais.

Le tri complet d'une page de direct : langues du profil, puis numéro de chaîne, puis
alphabet. Trois clés, une seule requête.

**Les flèches de rangée.** La barre de défilement est masquée — elle coupait le bas de chaque
vignette — et rien ne la remplaçait : au doigt et au pavé tactile la rangée glissait, mais à
la souris elle était **bloquée** sur ses huit premières entrées, la molette ne défilant qu'à
la verticale. Deux gestes la débloquent. **Deux flèches** apparaissent au survol, et seulement du côté où
il reste quelque chose : une flèche gauche sur une rangée déjà à gauche invite à un geste sans
effet. Ce sont des disques opaques cernés de blanc et non les bandes dégradées d'origine, qui
disparaissaient sur une affiche sombre. Et **la rangée se tire à la souris**, comme au doigt.

Le glissement a deux garde-fous. Le pointeur est capturé, sinon relâcher la souris cinq pixels
plus bas laissait la rangée collée au curseur. Et un `onClickCapture` annule le clic
**au-delà de quatre pixels parcourus** : sans lui, tirer la rangée ouvrait le film qui se
trouvait sous le curseur au relâchement ; avec un seuil à zéro, plus aucune vignette ne
s'ouvrait. Vérifié dans les deux sens — 60 px de glissement n'ouvrent rien, 2 px de tremblement
ouvrent la fiche.

Rien de tout cela sur écran tactile : le doigt fait déjà le travail, et une flèche y resterait
affichée en permanence faute de survol pour la faire disparaître.

**Les textes TMDB dans plusieurs langues, sans un appel de plus.** Le catalogue est classé par
langue depuis que chaque profil choisit les siennes, mais les synopsis restaient dans celle du
fournisseur : un profil réglé en allemand lisait un titre allemand surmontant un résumé
français. TMDB livre **toutes** ses traductions dans le même appel que la fiche —
`append_to_response=translations`, 55 langues pour un film courant, vérifié. Le multilingue ne
coûte donc aucune requête supplémentaire, seulement du stockage : c'est ce qui rendait la
décision facile, à condition de la prendre **avant** le grand passage d'enrichissement plutôt
qu'après.

`tmdb_texts` garde le titre et le synopsis, une ligne par œuvre et par langue. La clé est
l'identifiant TMDB et non la ligne du catalogue : le fournisseur publie la même œuvre 3,26 fois
en moyenne, une seule ligne les sert toutes. Six langues par défaut (`TMDB_LANGUAGES`),
environ 340 octets chacune. Les fiches et la mise en avant suivent **la langue de lecture** — celle de
l'interface d'abord, puis les langues du catalogue, puis le texte d'origine. L'ordre compte :
un synopsis est du texte à lire, comme les boutons, pas un critère de sélection. Il suivait
d'abord les langues du catalogue, si bien qu'un profil réglé sur un catalogue allemand et une
interface française lisait ses résumés en allemand, ce qu'il n'avait demandé nulle part. Les
listes, elles, n'ont besoin de rien : la déduplication y choisit déjà la ligne dans la bonne
langue.

**L'interface se traduit, et sa langue est un réglage à part.** J'avais d'abord fait suivre la
première langue du catalogue, en me disant que personne ne voudrait « catalogue en allemand,
boutons en français ». C'était confondre deux intentions : les langues du catalogue ordonnent
des dizaines de milliers d'entrées parmi les **127** que publie le fournisseur, l'interface
n'existe qu'en **quatre**. Classer son catalogue en italien ne peut pas traduire l'application,
et n'a aucune raison de l'essayer. `profiles.ui_language` est donc distinct, et nul par défaut :
sans choix, l'interface suit la première langue du catalogue qui soit traduite, et le français
sinon — le défaut évident reste le défaut.

La clé de traduction **est le texte français**, comme gettext — le code reste
lisible, un texte non traduit s'affiche en français plutôt que de casser, et il n'y a pas deux
cents identifiants à inventer puis à retrouver. Le prix est qu'une même phrase ne peut pas se
traduire de deux façons ; sur deux cents libellés, ce n'est jamais arrivé.

Singulier et pluriel sont deux textes distincts, chacun traduit pour lui-même : ajouter un
« s » à la traduction donnait « seriess », et les règles de pluriel ne se ressemblent pas assez
d'une langue à l'autre pour tenir dans une convention.

Trois langues livrées — anglais, allemand, espagnol —, **219 textes chacune**. Ajouter une
langue, c'est un fichier dans `lib/locales/` et une ligne dans `DICTS` ; rien d'autre dans
l'application n'a à changer.

**Chaque profil choisit ses langues.** Tout ce qui classait le catalogue disait « français
d'abord » en dur : le rang de langue des lignes, l'ordre de la colonne de catégories, les
rangées d'ajouts récents, la mise en avant, la recherche. C'était le bon défaut pour ce foyer,
mais un défaut écrit dans le code — pas un choix.

`profiles.languages` porte de une à trois langues, dans l'ordre de préférence. Sur le profil
et non sur le compte, pour la même raison que les favoris : deux personnes d'un même foyer ne
regardent pas dans la même langue.

Trois pièces le rendent possible :

- **`lang_code`, colonne générée sur `streams` et `series`.** La détection passait par un
  `regexp_match` exécuté à chaque requête : 1,3 s par balayage des 311 908 lignes de films.
  Stockée, la valeur se lit, s'indexe et se compare à n'importe quelle liste de préférences.
  Elle prend la relève de `lang_rank`, dont l'ordre figé ne peut pas servir trois profils qui
  n'ont pas les mêmes langues ;
- **`prefRank(viewer, table)`**, qui construit
  `coalesce(array_position(array[…], lang_code), 99)`. Les codes voyagent en **paramètres** et
  ne sont jamais concaténés — ils viennent d'une table, donc de quelque chose qu'un
  utilisateur écrit. Le surcoût mesuré sur la déduplication complète des films, la requête la
  plus lourde : **146 ms → 197 ms** ;
- **la déduplication s'y plie aussi**, et c'est ce qui compte vraiment. Le représentant d'une
  œuvre est sa version dans la langue préférée : sans cela, un profil réglé en allemand aurait
  vu des titres français partout, l'ordre n'ayant rien à réordonner.

Deux granularités cohabitent, volontairement. `languageRank` répond « quelle langue » et met
`FR`, `VF` et `VOSTFR` au même rang — il sert à grouper des catégories. `preferredCodes` garde
l'ordre fin, où le doublage passe devant le sous-titrage — il sert à départager deux
déclinaisons d'un même film.

Rien n'est filtré, seulement ordonné : le catalogue étranger reste accessible, il passe
derrière. Filtrer aurait vidé l'écran d'un foyer dont le fournisseur ne publie pas la langue
choisie.

Conséquence sur le cache : **sa clé porte les langues** en plus du compte. Le nombre d'œuvres
visibles par catégorie en dépend, puisque le représentant change. `primeCatalogCache` réchauffe
une passe par jeu de langues distinct du foyer — trois profils qui regardent tous en français
n'en remplissent qu'un.

Le sélecteur ne propose pas une liste figée : `catalogLanguages()` compte ce que le catalogue
**contient**, chaînes et œuvres confondues, et garde ce qui dépasse quarante entrées. Offrir
« Coréen » à un abonnement qui n'en a pas une ligne serait une promesse vide. Sur ce
catalogue : 127 langues, l'anglais et le français en tête.

Elle est portée par le **compte**, pas par le profil — les langues d'un catalogue dépendent des
abonnements, pas de qui regarde. C'est ce qui permet de la consulter depuis l'écran des
profils, où justement aucun profil n'est encore choisi : la route exigeait `viewerOf`, elle y
répondait `409 NO_PROFILE`, et le sélecteur restait désespérément vide.

**Le fournisseur emploie un code par marché, pas un par langue.** L'anglais arrive sous `EN`,
`US`, `UK`, `AU`, `IE`, `NZ` et `ENGLISH`. Choisir « Anglais » ne ramenait donc que les
60 578 entrées estampillées `EN` : les 11 960 de `US` restaient rangées avec le turc, et la
colonne de gauche ne classait qu'**une** catégorie en anglais sur 387 — celle qui s'appelle
littéralement « ENGLISH ». Elle en classe 83 depuis que les codes sont regroupés en familles.

Chaque famille a été vérifiée présente dans le catalogue réel, et chacune s'appuie sur ce que
la table des libellés dit déjà : `UK` et `EN` y portent tous deux « Anglais », `AL` et `ALB`
« Albanais », `SE` et `SW` « Suédois ». On ne regroupe pas plus loin — `CA` est bilingue et
`BR` porte son propre libellé ; les fondre ramènerait du contenu qui n'est pas dans la langue
demandée. Le sélecteur n'offre plus qu'une entrée par famille, dont le volume additionne toutes
ses orthographes : 119 langues au lieu de 127, « Anglais » passant de 92 110 à 106 818.

**Le rang porte sur la langue, pas sur l'orthographe.** Ordonner sur la liste à plat mettait
les 60 578 entrées `EN` devant les 2 132 `UK`, et un profil réglé en anglais voyait
« Christmas 3 » soixante mille lignes avant BBC. À rang égal c'est le numéro de chaîne qui
départage : ce profil ouvre maintenant sur ITV 1, Channel 4, Channel 5, E4, Film 4, Dave.

**Le catalogue dérivé est gardé en mémoire entre deux syncs.** Trois cartes accompagnent
chaque liste de catégories — le nombre d'œuvres visibles, le logo commun, la langue
réellement portée par le contenu. Toutes trois parcourent le catalogue entier, toutes trois
ne changent qu'à la synchronisation, et toutes trois étaient pourtant recalculées à chaque
ouverture de page : `listCategories('vod')` prenait **3,4 s**, dont 5 s pour la seule
détection de langue quand elle tournait seule. C'est le « trois secondes où il ne se passe
rien » au changement de page — l'accueil en payait deux d'affilée, une pour les films et une
pour le direct. L'accueil entier est passé de **3 876 ms à 287 ms**.

`services/catalog-cache.ts` tient ce cache. Deux détails comptent :

- **il porte sur les trois calculs, pas sur la liste rendue.** Le classement par langue,
  l'épinglage et le filtre adulte dépendent du profil qui regarde et restent calculés à
  chaque appel — c'est ce qui rend la clé `${type}:${userId}` suffisante ;
- **c'est la promesse qui est stockée, pas sa valeur.** Deux pages ouvertes en même temps
  partagent alors la même requête au lieu d'en lancer deux.

L'invalidation est explicite : fin de synchronisation (dans le `finally`, un sync interrompu
a déjà écrit des lignes), ajout, modification ou retrait d'un abonnement. Un TTL de dix
minutes répare une invalidation manquée. Et comme le remplir coûte quatre secondes,
`primeCatalogCache()` le réchauffe **au démarrage du serveur et après le sync de 4 h**, sans
que personne n'attende : sans cela, le prix se payait à la première visite du matin.

**Une image par ligne, pas une liste collée.** Certains panels publient `backdrop_path` comme
plusieurs URLs séparées par des espaces dans une même chaîne. La valeur passait telle quelle
en base : 3 458 séries portaient une adresse qu'aucun navigateur ne pouvait charger.
`looseFirstUrl` coupe désormais à l'entrée — **uniquement devant un `http`**, parce que le
fournisseur héberge aussi 4 372 fichiers dont le nom contient une espace
(`.../images (30).jpg`) et que couper sur toute espace les aurait tous cassés. La migration
`0014` répare l'existant.

**Secrets.** Credentials provider chiffrés en AES-256-GCM (`MASTER_KEY`), jamais renvoyés par
l'API même à un admin. Les URLs de flux contiennent les identifiants : elles sont masquées
avant tout logging (`src/lib/redact.ts`).

## Quand le panel ne répond pas

`provider test <id>` remonte le code système réel plutôt qu'un « fetch failed » opaque :

| Message | Sens |
|---|---|
| `ENOTFOUND` | le nom d'hôte n'existe pas — faute de frappe dans l'URL |
| `ECONNREFUSED` | rien n'écoute sur ce port — il manque probablement le `:port` |
| `ETIMEDOUT` | aucune réponse — hôte injoignable ou filtré silencieusement |
| `ECONNRESET` / `UND_ERR_SOCKET` | la connexion s'établit puis est coupée — voir ci-dessous |
| `PROVIDER_AUTH_FAILED` | le panel répond mais refuse les identifiants |

Une coupure après établissement de la connexion ne vient presque jamais du panel. Pour
localiser la cause, comparer trois requêtes :

```bash
curl -s -o /dev/null -w "%{http_code}\n" -A "IPTV-Personal/1.0" "http://TON-HOTE/player_api.php"
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" -A "IPTV-Personal/1.0" "http://TON-HOTE/player_api.php?username=zzz&password=zzz"
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" -A "IPTV-Personal/1.0" "http://neverssl.com/player_api.php?username=zzz&password=zzz"
```

Si la première passe et que les deux suivantes sont coupées — y compris la troisième, qui
vise un hôte sans rapport — c'est un équipement d'inspection sur le chemin réseau (suite de
sécurité locale, ou filtrage opérateur) qui réagit à la signature de la requête, pas le
panel. Tester depuis un autre réseau (partage de connexion mobile) tranche entre les deux.

Attention aussi : beaucoup de panels rejettent le `User-Agent` de curl. Un test sans `-A`
peut échouer là où l'application passe très bien.

**EPG — couverture partielle, et c'est la donnée qui manque, pas le code.** Le XMLTV du
fournisseur ne décrit que **3 586 chaînes** sur 28 200. Deux pistes ont été mesurées avant
d'être écartées : les déclarations `<channel>` du fichier ont toutes un `id` vide, donc
inexploitables pour un appariement ; et rapprocher les noms de chaînes des identifiants
(`boomerang.fr`, `raiyoyo.it`) ne récupère que 326 chaînes sur 20 484. `get_short_epg`
interrogé chaîne par chaîne renvoie zéro programme pour celles qui manquent. Sur les chaînes
françaises, 512 sur 1 372 ont un programme en cours — les principales sont couvertes.

**EPG.** La grille est lue en flux et insérée par lots. Deux pièges rencontrés sur des
données réelles : les grilles contiennent des programmes en double (même chaîne, même heure),
que Postgres refuse dans un seul `INSERT … ON CONFLICT` — ils sont écartés dans le lot ; et
seule une partie des chaînes porte un `epg_channel_id` côté panel, donc la couverture est
partielle par nature. L'écran d'administration l'affiche pour éviter de chercher un bug là où
il n'y en a pas.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Postgres |
| `MASTER_KEY` | chiffrement des credentials provider (32 octets) |
| `TICKET_SECRET` | signature des tickets de lecture (32 octets) |
| `SESSION_TTL_DAYS` | durée de vie d'une session (30 par défaut) |
| `WEB_ORIGIN` | origines autorisées en CORS, séparées par des virgules |
| `PUBLIC_URL` | URL publique du backend, utilisée dans les manifests réécrits |
| `TMDB_API_KEY` | facultative ; sans elle l'enrichissement reste désactivé |

## Notes d'installation

`pnpm.overrides` fige **une seule version de React** (19.2.3) pour tout le dépôt. Sans cela,
web et mobile résolvent deux copies différentes et le rendu serveur de Next échoue sur un
`useContext of null` difficile à rattacher à sa cause.

Le linker par défaut de pnpm (`node_modules` isolé) fonctionne pour les quatre paquets, Expo
compris — inutile de passer en `node-linker=hoisted`.

## Repartir de zéro

```bash
pnpm db:down && docker volume rm iptv_pgdata && pnpm db:up && pnpm --filter backend db:migrate
```
