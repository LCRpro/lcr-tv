import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Outfit, Inter, Noto_Color_Emoji } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '../lib/session';
import { PlayerProvider } from '../lib/player';
import { LocaleProvider } from '../lib/i18n';

/*
 * Deux familles, selon la charte LCR TV.
 *
 * Outfit porte les titres et les éléments d'interface qui demandent du
 * caractère — géométrique, affirmée, elle répond aux formes du logo. Inter
 * prend le texte courant, les descriptions et les informations : très lisible
 * dans une interface française dense, elle complète Outfit sans surcharger.
 * (Archivo, famille unique précédente, a été retirée au profit de ce duo.)
 */
const titleFont = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-title-src',
});

const bodyFont = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body-src',
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
    <html lang="fr" className={`${titleFont.variable} ${bodyFont.variable} ${emoji.variable}`}>
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
