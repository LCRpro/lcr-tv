/*
 * Ce qu'un APK doit declarer pour exister sur un televiseur.
 *
 * Une application Android ordinaire s'installe sur un Fire TV ou une box
 * Android TV, mais n'apparait nulle part : le lanceur « leanback » ne liste que
 * les activites qui portent sa propre categorie d'intention, et n'affiche pas
 * une icone mais une banniere 320x180. Sans ces deux declarations, l'APK est
 * installe et introuvable — on ne peut le lancer qu'a l'`adb`.
 *
 * Deux autres lignes disent au systeme que le materiel de telephone n'est pas
 * requis. Sans elles, le Play Store refuserait l'application sur televiseur, et
 * certains lanceurs la filtrent aussi.
 *
 * Ces reglages n'existent pas dans `app.json` : ils passent forcement par un
 * greffon, execute par `expo prebuild` — donc aussi sur les machines d'EAS
 * Build, ce qui est tout l'interet.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const BANNIERE = 'tv-banner.png';
/** Un nom de ressource Android : minuscules et soulignes, jamais de tiret. */
const RESSOURCE = 'tv_banner';

/** Ajoute une entree `uses-feature` si elle n'y est pas deja. */
function declareFeature(manifest, name) {
  const liste = (manifest['uses-feature'] ??= []);
  if (liste.some((f) => f.$?.['android:name'] === name)) return;
  liste.push({ $: { 'android:name': name, 'android:required': 'false' } });
}

const withAndroidTv = (config) => {
  const withManifest = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    /* « leanback non requis » : l'application tourne sur televiseur *et* sur
       telephone, c'est le meme binaire. « touchscreen non requis » : sans elle,
       un televiseur — qui n'a pas d'ecran tactile — est considere incompatible. */
    declareFeature(manifest, 'android.software.leanback');
    declareFeature(manifest, 'android.hardware.touchscreen');

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:banner'] = `@drawable/${RESSOURCE}`;

    /*
     * Le trafic en clair, seulement si l'API est en clair.
     *
     * Depuis Android 9, une application compilee en release ne peut plus
     * ouvrir de connexion HTTP : le backend est sur le reseau local en
     * `http://…:3001`, et l'APK ne l'atteindrait tout simplement pas. On
     * n'ouvre donc cette porte que tant que l'adresse configuree est en clair —
     * passer l'API en HTTPS la referme d'elle-meme, sans qu'on ait a y penser.
     */
    const api = String(cfg.extra?.apiUrl ?? '');
    if (api.startsWith('http://')) {
      application.$['android:usesCleartextTraffic'] = 'true';
    } else {
      delete application.$['android:usesCleartextTraffic'];
    }

    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    for (const filtre of activity['intent-filter'] ?? []) {
      const actions = filtre.action ?? [];
      if (!actions.some((a) => a.$?.['android:name'] === 'android.intent.action.MAIN')) continue;
      const categories = (filtre.category ??= []);
      const leanback = 'android.intent.category.LEANBACK_LAUNCHER';
      if (!categories.some((c) => c.$?.['android:name'] === leanback)) {
        categories.push({ $: { 'android:name': leanback } });
      }
    }

    return cfg;
  });

  /* La banniere doit exister comme ressource dessinable du projet natif : elle
     est recopiee a chaque prebuild, pour qu'un `assets/` modifie suive sans
     qu'on ait a regenerer quoi que ce soit a la main. */
  return withDangerousMod(withManifest, [
    'android',
    (cfg) => {
      const source = join(cfg.modRequest.projectRoot, 'assets', BANNIERE);
      const dossier = join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable',
      );
      mkdirSync(dossier, { recursive: true });
      copyFileSync(source, join(dossier, `${RESSOURCE}.png`));
      return cfg;
    },
  ]);
};

module.exports = withAndroidTv;
