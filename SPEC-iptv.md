# Plateforme IPTV personnelle — spécification

Document de référence pour l'implémentation. Lire entièrement avant d'écrire du code.

## 1. Contexte

Application privée permettant de consommer un abonnement IPTV **Xtream Codes** (URL + username + password) via une interface web et une application mobile, avec des comptes utilisateurs distincts (favoris, historique, reprise de lecture).

Périmètre : usage personnel, 3 à 5 utilisateurs. Pas d'inscription publique, pas de scalabilité horizontale à prévoir.

**Trois notions à ne jamais confondre :**

| Notion | Cardinalité | Rôle |
|---|---|---|
| Compte applicatif | N | Authentification, préférences, données personnelles |
| Provider Xtream | 1 actif | L'abonnement, partagé par tous les comptes |
| Slot de lecture | limité par le provider | Autorisation temporaire de lire un flux |

Ce n'est pas du multi-tenant : c'est un modèle de profils sur un abonnement unique.

## 2. Stack

- **Monorepo** pnpm workspaces : `backend/`, `web/`, `mobile/`, `packages/shared/`
- **Backend** : Node 22, TypeScript, Fastify, Drizzle ORM, Zod
- **DB** : PostgreSQL 16 en Docker, extensions `unaccent` et `pg_trgm` obligatoires
- **Web** : Next.js (App Router), hls.js
- **Mobile** : Expo, `expo-video`, `expo-secure-store`
- **Partagé** : types du catalogue et contrats d'API dans `packages/shared`, importés par les deux fronts

Postgres plutôt que SQLite pour la recherche : `unaccent` + `pg_trgm` gèrent les titres français accentués et les fautes de frappe sans code applicatif.

## 3. API Xtream Codes

Base : `{scheme}://{host}:{port}/player_api.php?username={U}&password={P}`

### Métadonnées

| Action | Retour |
|---|---|
| *(aucune)* | `user_info` (statut, expiration, `max_connections`, `active_cons`) et `server_info` |
| `get_live_categories` | catégories live |
| `get_live_streams` | chaînes, param optionnel `category_id` |
| `get_vod_categories` | catégories films |
| `get_vod_streams` | films, param optionnel `category_id` |
| `get_vod_info&vod_id=X` | détail film, `movie_data.container_extension` |
| `get_series_categories` | catégories séries |
| `get_series` | séries |
| `get_series_info&series_id=X` | saisons + épisodes, chaque épisode a son `id` et son `container_extension` |
| `get_short_epg&stream_id=X&limit=N` | EPG court d'une chaîne |

EPG complet : `xmltv.php?username={U}&password={P}` — plusieurs centaines de Mo, à streamer, jamais à charger en mémoire.

### URLs de flux

```
live    {base}/live/{U}/{P}/{stream_id}.m3u8      (ou .ts)
film    {base}/movie/{U}/{P}/{stream_id}.{container_extension}
épisode {base}/series/{U}/{P}/{episode_id}.{container_extension}
```

### Pièges connus

- Aucun header CORS n'est renvoyé → le proxy backend est obligatoire, pas optionnel.
- `get_vod_streams` peut renvoyer plusieurs dizaines de milliers d'entrées → jamais en direct depuis le front.
- Les réponses sont faiblement typées : entiers renvoyés en chaînes, `null` inattendus, champs absents. Tout parser en Zod avec des `coerce` et échouer proprement.
- Certains panels renvoient `[]` ou `false` au lieu d'une erreur quand les identifiants sont mauvais.
- Les catégories adultes sont mélangées aux autres, repérables par le nom de catégorie (`XXX`, `ADULT`, `+18`).

## 4. Schéma de données

```
providers        id, name, base_url, username_enc, password_enc, is_active,
                 max_connections, last_sync_at, created_at

users            id, email, password_hash, role('admin'|'user'),
                 can_watch_adult, is_active, created_at
sessions         id, user_id, token_hash, device_label, user_agent,
                 last_seen_at, expires_at, created_at

categories       id, provider_id, xtream_id, type('live'|'vod'|'series'),
                 name, is_adult
streams          id, provider_id, xtream_id, type('live'|'vod'),
                 name, name_normalized, icon_url, category_id,
                 container_extension, added_at, removed_at
series           id, provider_id, xtream_id, name, name_normalized,
                 cover_url, plot, category_id, removed_at
episodes         id, series_id, xtream_id, season, episode_num,
                 title, container_extension, duration_sec

favorites        user_id, item_type('stream'|'series'), item_id, created_at
watch_progress   user_id, item_type, item_id, position_sec, duration_sec,
                 completed, updated_at
playback_slots   id, user_id, session_id, item_type, item_id,
                 acquired_at, heartbeat_at
```

Index requis : GIN trigram sur `streams.name_normalized` et `series.name_normalized`, unique sur `(provider_id, type, xtream_id)`, unique sur `(user_id, item_type, item_id)` pour favoris et progression.

`name_normalized` = minuscule + `unaccent`, calculée à l'insertion.

## 5. Décisions d'architecture

### 5.1 Credentials du provider

Chiffrés en **AES-256-GCM** en base, clé maître dans `MASTER_KEY` (env). Jamais en clair dans les logs, jamais renvoyés par l'API même à un admin — l'UI affiche des valeurs masquées et n'envoie que les champs modifiés.

Un seul provider `is_active` à la fois. Le changer ne doit pas détruire le catalogue existant.

### 5.2 Sessions, pas de JWT

Token opaque de 32 bytes aléatoires, stocké **hashé** en base. Justification : la révocation immédiate est un besoin explicite (déconnecter un appareil, désactiver un compte), et un JWT ne se révoque pas sans blacklist — ce qui annule son intérêt.

Deux transports, un seul middleware :
- Web : cookie `httpOnly`, `Secure`, `SameSite=Lax`
- Mobile : header `Authorization: Bearer`, token dans `expo-secure-store`

`SameSite=Lax` couvre le CSRF sur le périmètre web. Argon2id pour les mots de passe.

### 5.3 Lecture : tickets HMAC

**Problème :** une balise `<video>` et hls.js n'envoient pas de header `Authorization` sur les requêtes de segments `.ts`. Un endpoint de lecture protégé par le middleware normal ne recevra jamais le token.

**Solution :**
1. Le client appelle `POST /api/play/:type/:id`, authentifié normalement.
2. Le backend acquiert un slot, puis renvoie une URL de manifest contenant un ticket HMAC : payload `{user_id, item_type, item_id, exp}`, durée 15 min, scopé à cet item précis.
3. Les routes de manifest et de segments valident **uniquement** le ticket.

**Web** : proxy réel. Le `.m3u8` est récupéré, les URLs de segments sont réécrites vers le backend avec le même ticket, les segments sont streamés (`pipe`, jamais de buffer complet).

**Mobile** : redirection 302 vers l'URL Xtream directe. ExoPlayer et AVPlayer lisent `.ts` et `.mkv` nativement, et la bande passante ne transite pas par le serveur.

> Compromis assumé et à documenter : le 302 expose les identifiants du provider à qui inspecte le trafic de l'app mobile. Acceptable pour un cercle de proches. Si ce n'est plus le cas, proxifier aussi le mobile et perdre le gain de bande passante.

**Limite navigateur :** les films en `.mkv` ne sont pas lisibles en `<video>`. Ne pas tenter de remux ffmpeg dans une première version — détecter le container et afficher un message clair invitant à utiliser l'app mobile.

### 5.4 Slots de connexion simultanée

L'abonnement limite les connexions simultanées (souvent 1 ou 2). Dépasser la limite fait couper le panel de façon aléatoire, y compris pour les sessions déjà en cours — symptôme facile à confondre avec un bug applicatif.

- `max_connections` est lu depuis `user_info` au moment du sync, jamais codé en dur.
- Acquisition d'un slot avant toute lecture, en transaction.
- Heartbeat client toutes les 30 s, slot expiré et libéré à 90 s sans signal.
- Libération explicite à l'arrêt de la lecture.
- Si plus aucun slot : **409** avec le nom de l'utilisateur occupant le slot, à afficher tel quel côté client.

### 5.5 Synchronisation du catalogue

Job quotidien, déclenchable manuellement.

- Upsert sur `(provider_id, type, xtream_id)`.
- **Jamais de DELETE** : les entrées disparues sont marquées `removed_at`. Les fournisseurs renomment et réorganisent leurs catégories régulièrement ; un DELETE ferait perdre favoris et historique.
- Les épisodes de séries ne sont pas récupérables en masse : `get_series_info` est un appel par série. Les charger à la demande, au premier affichage d'une fiche, avec mise en cache.
- Le sync doit être idempotent et interruptible.

## 6. Pages

### Web

**Hors session** — `/login` : email + mot de passe. Rien d'autre, pas de reset par mail.

**Application**

| Route | Contenu |
|---|---|
| `/` | « Reprendre » (progressions non terminées) en premier, Ma liste, ajouts récents, rangées par catégorie |
| `/live` | Chaînes par catégorie, sidebar de catégories, « en ce moment » quand l'EPG est en place |
| `/films` | Grille, filtre catégorie, tri, pagination infinie |
| `/series` | Idem |
| `/films/:id` | Fiche, bouton lecture, reprise si progression existante |
| `/series/:id` | Synopsis, sélecteur de saison, liste d'épisodes avec barre de progression |
| `/search` | Recherche unifiée, onglets Live / Films / Séries |
| `/ma-liste` | Favoris, filtrables par type |
| `/historique` | Vu récemment, suppression d'entrée possible |
| `/compte` | Mot de passe, appareils connectés avec déconnexion, préférences |

**Lecteur** : overlay plein écran, pas une route dédiée — le contexte de navigation doit être préservé au retour.

**Admin, sous `/admin`** (rôle `admin` uniquement)

| Route | Contenu |
|---|---|
| `/admin/providers` | URL, identifiants, test de connexion, `max_connections` détecté, bascule d'actif |
| `/admin/users` | Création, rôle, flag adulte, désactivation |
| `/admin/sync` | Dernier run, volumétrie, relance manuelle |
| `/admin/slots` | Qui regarde quoi, coupure d'une session |

### Mobile

Tab bar à quatre entrées : **Accueil, Live, Recherche, Compte**. Films et Séries sont des sections de l'accueil, pas des onglets — au-delà de quatre, la barre devient illisible.

Fiches détail et lecteur en écrans empilés. Lecteur en modal plein écran. **Pas d'interface admin sur mobile.**

## 7. États à traiter dès le départ

Ces trois cas surviennent en usage normal et dégradent fortement l'expérience s'ils sont ajoutés après coup :

1. **409 slots occupés** — message explicite nommant l'utilisateur occupant, proposition de réessayer.
2. **Session expirée en pleine lecture** — le ticket vit 15 min ; sur une expiration en cours de film, renouveler silencieusement plutôt que d'éjecter vers le login.
3. **Catalogue vide, sync en cours** — au premier lancement, écran d'attente avec progression, pas une grille vide.

## 8. Ordre d'implémentation

Chaque phase doit être vérifiable seule. Le catalogue vient avant l'auth : une base vide ne se debug pas.

**0. Socle** — monorepo, Docker Postgres avec extensions, Fastify, Drizzle, première migration. *Fini quand `/health` répond.*

**1. Providers + sync** — chiffrement, client Xtream typé en Zod, job de sync en CLI, sans HTTP ni auth. *Fini quand la base est remplie et qu'une seconde exécution ne duplique rien.*

**2. Auth** — users, sessions, argon2id, middleware bi-transport, seed du compte admin. *Fini quand une session se crée et se révoque.*

**3. API catalogue** — catégories, listing paginé, recherche trigram, détail série. Tout protégé, testable au curl. *Fini sans une ligne de front.*

**4. Lecture** — tickets HMAC, slots avec heartbeat, proxy HLS avec réécriture du manifest. *Fini quand un `.m3u8` se lit dans VLC via le proxy.*

**5. Web** — Next.js, login, grilles, recherche, hls.js. *Première version réellement utilisable.*

**6. Mobile** — Expo, secure-store, mêmes écrans. Le backend ne change pas, seul le transport du token diffère.

**7. Personnalisation** — favoris, `watch_progress` (PATCH toutes les 10 s pendant la lecture), rangée « Reprendre », historique.

**8. Confort** — enrichissement TMDB en job séparé (les métadonnées Xtream sont de très mauvaise qualité), EPG XMLTV, UI admin de gestion des comptes.

**Deux règles d'ordre :** ne pas commencer le front avant la phase 5, sinon les écrans seront remaniés à chaque évolution de l'API. Garder l'EPG pour la fin — parser du XMLTV volumineux est un sujet à part entière, sans dépendance avec le reste.

## 9. Conventions

- TypeScript strict, pas de `any`.
- Toute réponse externe validée en Zod avant usage.
- Variables d'env : `DATABASE_URL`, `MASTER_KEY`, `TICKET_SECRET`, `SESSION_TTL_DAYS`, `TMDB_API_KEY` (phase 8).
- Aucun secret dans les logs. Les URLs de flux contiennent les identifiants du provider : les masquer systématiquement avant tout logging.
- Erreurs API au format `{ error: { code, message } }`, codes stables consommés par les deux fronts.
- Migrations Drizzle versionnées, jamais de modification manuelle du schéma.
