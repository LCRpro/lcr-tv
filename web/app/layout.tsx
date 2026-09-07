import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Archivo, Noto_Color_Emoji } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '../lib/session';
import { PlayerProvider } from '../lib/player';
import { LocaleProvider } from '../lib/i18n';

/*
 * Une seule famille.
 *
 * Archivo prend tout — titres, libelles, chiffres, tableaux, colonnes. Une
 * grotesque un peu large, aux chiffres tabulaires et aux diacritiques nettes,
 * ce qui compte dans une interface francaise dense. Les titres s'en
 * distinguent par la taille et la graisse, jusqu'a 800.
 *
 * L'antique des titres (Fraunces) a ete essayee et retiree : le contraste se
 * voulait editorial, il a ete lu comme un decalage.
 */
const ui = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-ui',
});

/*
 * Windows n'embarque aucune police contenant les drapeaux : Chrome y affiche
 * les indicateurs regionaux sous forme de deux lettres dans un cadre, ce qui
 * revient au code que l'on cherchait justement a remplacer. On charge donc
 * Noto Color Emoji, servie depuis notre propre domaine par next/font.
 */
const emoji = Noto_Color_Emoji({
  weight: '400',
  subsets: ['emoji'],
  display: 'swap',
  variable: '--font-emoji',
});

export const metadata: Metadata = {
  title: 'LCR TV',
  description: 'LCR TV — votre catalogue, partout.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${ui.variable} ${emoji.variable}`}>
      {/*
        Les extensions de navigateur (ColorZilla, gestionnaires de mots de passe,
        traducteurs) ajoutent leurs propres attributs sur <body> avant que React
        ne s'hydrate, ce qui declenche un avertissement d'hydratation sans qu'il
        y ait la moindre divergence dans notre rendu. On neutralise la comparaison
        sur ce seul noeud ; les enfants restent verifies normalement.
      */}
      <body suppressHydrationWarning>
        <SessionProvider>
          {/* La langue d'interface suit le profil : elle a donc besoin de la
              session, et tout ce qui traduit a besoin d'elle. */}
          <LocaleProvider>
            <PlayerProvider>{children}</PlayerProvider>
          </LocaleProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
