# Limite de connexions simultanées — état des lieux

Document de reprise. Il décrit une installation IPTV personnelle, la contrainte d'une seule
connexion simultanée, et ce qui est techniquement possible ou non autour de cette contrainte.

> **Mise à jour — résolu.** L'installation dispose désormais de **deux abonnements**
> distincts à une connexion chacun. Le support multi-abonnements est implémenté : les
> connexions s'additionnent, le catalogue est dédupliqué, et la lecture bascule
> automatiquement sur l'abonnement libre. Deux personnes peuvent regarder deux contenus
> différents en même temps. Le reste du document conserve l'analyse d'origine, qui reste
> valable pour un abonnement unique.

## 1. L'installation

Application privée qui consomme un abonnement **Xtream Codes** via une interface web et une
application mobile, pour 3 à 5 utilisateurs d'un même foyer. Comptes distincts avec favoris,
historique et reprise de lecture.

| Brique | Choix |
|---|---|
| Monorepo | pnpm workspaces — `backend/`, `web/`, `mobile/`, `packages/shared/` |
| Backend | Node 22, Fastify, Drizzle ORM, Zod |
| Base | PostgreSQL 16 (Docker), extensions `unaccent` et `pg_trgm` |
| Web | Next.js App Router, hls.js |
| Mobile | Expo SDK 57, `expo-video`, `expo-secure-store` |

Catalogue réel actuellement synchronisé : **28 200 chaînes live, 155 880 films,
49 640 séries**. Recherche trigram à 14 ms, listes et accueil entre 220 et 430 ms.
La lecture est vérifiée de bout en bout : manifest HLS réécrit par le backend, segments
MPEG-TS relayés en flux.

## 2. La contrainte

Le panel déclare, dans `user_info` :

```json
{ "user_info": { "max_connections": "1", "active_cons": "0", "status": "Active" } }
```

**Une seule connexion simultanée.** Cette valeur est réglée côté fournisseur ; elle est lue
à chaque synchronisation et jamais codée en dur dans l'application.

Conséquence concrète : une personne regarde un match, une autre ne peut pas regarder un film
au même moment.

## 3. Comment l'application la gère

Le panel n'applique pas la limite proprement : le dépasser fait **couper un flux au hasard**,
y compris une lecture déjà en cours. Symptôme facile à confondre avec un bug applicatif.

L'application compte donc elle-même, en amont :

- acquisition d'un slot avant toute lecture, sous verrou consultatif Postgres ;
- heartbeat client toutes les 30 s, slot récupéré après 90 s sans signal ;
- libération explicite à l'arrêt, plus un `sendBeacon` à la fermeture de l'onglet ;
- si plus aucun slot : **HTTP 409** avec le nom de l'utilisateur qui occupe la connexion et
  ce qu'il regarde, affiché tel quel côté client.

Fichiers concernés : `backend/src/services/slots.ts`, `backend/src/services/playback.ts`,
`backend/src/routes/play.ts`.

Le refus est donc volontaire et informatif — il remplace une coupure aléatoire par un message
compréhensible. Ce n'est pas l'application qui limite ; elle rend la limite lisible.

## 4. Ce qui est possible, ce qui ne l'est pas

### Impossible : deux contenus différents sur une connexion

Deux flux différents sont deux sessions HTTP distinctes vers le serveur du fournisseur, qui
transportent des octets différents. Aucun cache, proxy, multiplexage ou astuce de protocole
ne fait tenir deux contenus différents dans une seule connexion : l'information n'existe pas
d'un seul côté du tuyau. La limite est comptée sur le serveur du fournisseur, pas côté client.

Les « contournements » qui circulent reviennent tous à présenter des identifiants
supplémentaires — c'est-à-dire à consommer un service qui n'a pas été payé. Ce n'est pas une
solution technique, c'est un problème contractuel déguisé en problème technique.

### Possible : plusieurs spectateurs sur le **même** contenu

Là, il y a un vrai gain, et il reste dans les clous de l'abonnement.

Aujourd'hui, deux personnes qui lancent la même chaîne prennent deux slots et déclenchent
deux tirages amont. C'est du gâchis : le backend proxifie déjà les segments, il pourrait n'en
tirer qu'un seul jeu et le distribuer.

Ce que ça demande :

1. **Cache de segments** côté backend, indexé sur l'URL amont signée, TTL de quelques
   secondes. Les segments HLS sont immuables et courts : le deuxième spectateur est servi
   depuis le cache, sans requête supplémentaire vers le fournisseur.
2. **Slots comptés par contenu** plutôt que par session : un slot porte un compteur de
   spectateurs, il n'est libéré que quand le dernier part.
3. Affichage admin adapté : « 2 spectateurs sur 1 connexion ».

Coût estimé : environ une heure de travail. Utile même avec un abonnement à 2 connexions,
puisque ça en libère une quand deux personnes regardent la même chose.

Limite : ne sert que pour le direct partagé (un match, le journal). Pour de la VOD, deux
personnes ne sont jamais synchronisées, donc aucun gain.

## 5. Les options réelles

1. **Vérifier ce qui a été acheté.** Si l'offre souscrite annonce 2 connexions et que le
   panel en déclare 1, c'est un réglage erroné côté fournisseur, à corriger par leur support.
2. **Passer à une offre 2 connexions.** Généralement un à deux euros de plus par mois.
   Rien à modifier dans l'application : `max_connections` est relu depuis le panel à chaque
   `provider test` et à chaque synchronisation.
3. **Implémenter le partage de flux** décrit au point 4, si l'usage « tout le monde devant le
   même match » est fréquent.

## 6. Point annexe : un blocage antivirus rencontré en route

À noter pour quiconque reprend le sujet, parce que le symptôme est trompeur.

Sur la machine hôte, toute requête HTTP dont l'URL contenait **à la fois** `username=` et
`password=` voyait sa connexion coupée (`ECONNRESET` / `UND_ERR_SOCKET`), alors que :

- la même URL sans paramètres répondait `200` ;
- `?username=…` seul répondait `200` ;
- `?password=…` seul répondait `200` ;
- des identifiants totalement inventés déclenchaient la même coupure ;
- un hôte sans rapport (`neverssl.com`) avec le même motif d'URL était coupé aussi ;
- curl, Node/undici et .NET échouaient identiquement — donc en dessous des applications.

Cause : la **Suite de Sécurité Orange** (un Bitdefender rebadgé — `bdagent`, `bduserhost`,
`VSSERV`, `BDProtSrv`) et son module *Prévention des menaces en ligne*, dont l'heuristique
anti-hameçonnage réagit à des identifiants soumis en clair dans une URL. Résolu par une
exception sur le domaine du panel.

Leçon générale : l'API Xtream fait transiter les identifiants en clair dans la query string
de **chaque** requête. C'est une mauvaise pratique intrinsèque au protocole, que les
antivirus modernes signalent à juste titre. Le panel testé accepte aussi les identifiants en
**corps POST** (`player_api.php` en `application/x-www-form-urlencoded`), ce qui évite de les
inscrire dans les URLs et donc dans tous les journaux traversés. Piste d'amélioration
sérieuse, non implémentée : tous les panels ne supportent pas POST, il faudrait un repli
automatique sur GET.

## 7. Ce qui reste à faire sur le projet

- Import de la grille EPG (XMLTV) : implémenté et testé, pas encore lancé sur le catalogue
  réel — le fichier sera volumineux avec 28 200 chaînes.
- Accès depuis le téléphone : `PUBLIC_URL` et CORS configurés sur l'IP du réseau local,
  reste à autoriser les ports 3000/3001 dans le pare-feu Windows **et** dans celui de
  Bitdefender.
- Enrichissement TMDB : implémenté, inerte tant que `TMDB_API_KEY` n'est pas renseignée.
  Moins prioritaire que prévu, le panel fournit déjà des affiches TMDB.
