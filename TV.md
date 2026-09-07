# LCR TV sur téléviseur — état et suite

Ce document sert de fil conducteur pour le portage TV. Il dit ce qui est fait,
ce qui bloque, et dans quel ordre attaquer la suite.

## Deux contraintes à connaître avant de commencer

**Il n'y a de navigateur ni sur Apple TV, ni sur Android TV.** Seuls LG (webOS)
et Samsung (Tizen) en embarquent un — et ce sont justement les deux qui savent
installer une application web. Android TV, Google TV et Fire TV n'en ont aucun :
il leur faut l'application Android, et à l'Apple TV une **application tvOS
native**. Aucun raccourci n'existe. Une première version de ce document
affirmait le contraire et surestimait donc ce que le site couvre déjà.

**Compiler pour tvOS demande un Mac.** Xcode ne tourne que sur macOS, et il n'y a
pas d'exception. Depuis Windows, la seule voie est **EAS Build**, les machines
macOS d'Expo dans le cloud. Installer l'application sur un vrai Apple TV demande
en plus un compte Apple Developer (99 $/an) — le sideload gratuit ne couvre pas
tvOS.

Rien de tout cela n'empêche d'avancer : **l'essentiel du travail n'est pas
spécifique à Apple**, et se teste sur Android TV depuis Windows.

## Ce qui change vraiment sur un téléviseur

Ce n'est pas une question de taille d'écran. Trois choses n'existent pas au
salon :

- **Pas de curseur, pas de doigt.** Tout se pilote à la croix directionnelle.
  Chaque élément actionnable doit être *focusable* et **montrer** son focus. Un
  écran de télévision sans état de focus visible est littéralement impraticable.
- **Pas de saisie de texte confortable.** Un champ de recherche se remplit
  lettre par lettre avec un clavier à l'écran. Sur un catalogue de 24 000
  chaînes, la navigation par catégories et les favoris comptent bien plus que la
  recherche.
- **Pas de bord d'écran fiable.** Les téléviseurs rognent l'image — l'overscan.
  Sans marge de sécurité, la première colonne d'une grille est coupée sur
  certains modèles, et l'utilisateur n'a aucun moyen de le savoir.

## Fait

La couche TV vit dans l'application mobile existante, derrière `Platform.isTV`.
Sur téléphone, **rien ne change d'un pixel** : elle s'ajoute, elle ne remplace
rien.

- `mobile/lib/tv.ts` — détection, échelle 10 pieds (×1,5), marge d'overscan
  (48 px), largeur de vignette (×2,1 : on montre *moins* d'éléments sur TV, pas
  plus — parcourir vingt colonnes à la télécommande est interminable).
- `mobile/components/Focusable.tsx` — l'élément actionnable commun. Sur TV il
  devient focusable et affiche un anneau d'accent. L'anneau est un halo et un
  agrandissement, **pas une bordure** : une bordure décalerait la mise en page à
  chaque déplacement du focus, et il ne touche pas au rayon de l'élément — une
  pastille en gélule redevenait un rectangle au moment précis où l'œil la
  regarde.
- **Plus aucun `Pressable` nu dans l'application** (7 sept. 2026) : puces de
  catégories, étoiles de favori, onglets de recherche, « Tout voir », saisons,
  épisodes, déclinaisons, retour et choix de qualité du lecteur passent tous par
  `Focusable`. Il accepte exactement la même forme d'appel qu'un `Pressable` —
  style constant ou fonction, `hitSlop`, enfants ou fonction d'enfants — parce
  que c'est le coût de conversion qui avait laissé la couche TV limitée aux
  seules vignettes.
- Les commandes de lecture restent celles du système (`nativeControls` sur
  `VideoView`) : ExoPlayer les rend déjà navigables à la croix directionnelle
  sur Android TV. Ce qu'il fallait rendre focusable autour d'elles, c'est le
  retour — sans lui la télécommande entre dans le lecteur et n'en sort plus.
- L'accueil est déjà une pile de rangées horizontales depuis le rattrapage de la
  refonte (Ce soir, Reprendre, nouveautés, Ma liste par type, catégories) :
  c'est la disposition que le point 3 réclamait.

`FocusGroup` est pour l'instant un conteneur neutre. Il tiendra la place de
`TVFocusGuideView`, qui n'existe que dans `react-native-tvos` : le poser
maintenant évite d'avoir à retoucher tous les appelants plus tard.

## Construire l'APK sans SDK local

Cette machine n'a ni JDK, ni SDK Android, ni Android Studio (`ANDROID_HOME`
vide, `java` et `adb` absents du PATH) — et **c'est très bien ainsi** : Expo
compile sur ses propres machines. C'est déjà la seule voie possible pour tvOS,
autant s'en servir pour Android.

Ce qu'il a fallu ajouter pour qu'un APK existe sur un téléviseur :

- `mobile/eas.json` — trois profils. `preview` produit un **APK** (et non un
  bundle `.aab`, qui ne s'installe pas à la main), `development` y ajoute le
  client de développement, `production` sort le bundle du Play Store.
- `mobile/plugins/withAndroidTv.js` — un greffon de configuration, parce que
  rien de tout cela n'existe dans `app.json` :
  - la catégorie d'intention `LEANBACK_LAUNCHER` : sans elle, l'application
    s'installe et n'apparaît **nulle part** sur l'écran d'accueil du téléviseur ;
  - `android:banner` : le lanceur d'un téléviseur n'affiche pas une icône ;
  - `leanback` et `touchscreen` déclarés « non requis », sans quoi un téléviseur
    est considéré incompatible ;
  - `usesCleartextTraffic`, **seulement tant que `extra.apiUrl` est en `http://`**.
    Depuis Android 9 une application en release ne peut plus ouvrir de connexion
    en clair : sans cette ligne, l'APK n'atteindrait pas le backend du réseau
    local. Passer l'API en HTTPS referme la porte tout seul.
- `mobile/assets/tv-banner.png` — 320×180, engendrée par
  `mobile/tools/make-banner.mjs` (`pnpm --filter mobile banner`) pour qu'elle
  reste relisible : le nom du produit dans les couleurs du thème sombre.

Vérifié en engendrant réellement le projet natif (`expo prebuild`) : le
manifeste porte les quatre déclarations et la bannière arrive dans
`res/drawable/`. Le dossier `android/` a ensuite été supprimé — il est
regénéré à chaque build et le `.gitignore` l'exclut.

Deux réglages corrigés au passage : `edgeToEdgeEnabled` n'existe plus (Android 16
rend le bord-à-bord obligatoire), et `userInterfaceStyle: "dark"` ne faisait rien
sans `expo-system-ui` — d'où un aplat blanc au lancement, aveuglant sur un grand
écran le soir. Le fond système est maintenant `#121110`.

## Reste à faire, dans l'ordre

1. **Valider sur un vrai téléviseur.** La couche compile et se bundle, mais
   aucun écran de TV ne l'a affichée. Le chemin, une fois connecté à Expo
   (`npx eas login`, depuis un terminal — le mot de passe ne passe pas par moi) :

   ```
   pnpm --filter mobile build:tv
   ```

   EAS rend une URL d'APK. Sur le téléviseur, activer les options de
   développeur et l'installation d'applications inconnues, puis depuis le PC :
   `adb connect <ip-du-televiseur>:5555` et `adb install <fichier>.apk`.
   `adb` seul suffit (les *platform-tools* d'Android, ~10 Mo) — pas le SDK.

   À vérifier une fois à l'écran, dans cet ordre : l'application apparaît-elle
   sur l'accueil du téléviseur ; la croix directionnelle atteint-elle les puces
   de catégories, les vignettes et le lecteur ; l'anneau de focus se voit-il à
   trois mètres ; la première colonne de la grille est-elle coupée par
   l'overscan ; `extra.apiUrl` pointe-t-il bien vers l'IP de cette machine sur
   le réseau du salon.

2. **Cible tvOS.** En dernier, parce qu'elle ne peut pas être testée avant :
   - remplacer `react-native` par `react-native-tvos` via une résolution pnpm ;
   - ajouter le plugin `@react-native-tvos/config-tv` (compatible Expo ≥ 52) ;
   - construire via EAS Build.

   Attention : `react-native-tvos` publie `0.86.2-0` là où le projet est sur
   `react-native 0.86.3`. Ce décalage devra être arbitré au moment du portage —
   soit en attendant la version alignée, soit en gelant React Native d'un cran.

## Ce que le web couvre déjà

Le site fonctionne dans les navigateurs de LG (webOS) et Samsung (Tizen), mais
**à la souris**. Lui ajouter la navigation à la télécommande — focus visible et
parcours au clavier directionnel — le rendrait utilisable sur ces deux-là, qui
savent aussi empaqueter une application web. Android TV et Fire TV, eux,
n'ayant pas de navigateur, passent par l'application Android : c'est le même
codebase que le mobile, donc rien de plus à écrire une fois le point 1 validé.
