'use client';

/*
 * i18n-ignore-file — la vitrine est en français pour l'instant. Son texte ne
 * passe pas par `t()` : une page marketing se traduit à part, le jour où on la
 * lance dans une autre langue. Le reste de l'application, lui, reste vérifié.
 */

import Link from 'next/link';
import { BrandMark } from '../components/BrandMark';

/**
 * La vitrine — la seule page publique du web.
 *
 * Le produit, ce sont les applications ; le web les présente et, demain, mène
 * aux magasins. Le parti pris visuel suit celui du genre : un fond de nuit, un
 * titre en dégradé, les badges des magasins, et surtout l'application montrée
 * dans des téléphones. Ces captures sont les vrais écrans de LCR TV, en nuit
 * indigo.
 *
 * Un disclaimer, tout de suite sous le titre : LCR TV est un lecteur, pas un
 * fournisseur de contenu. C'est vrai, et c'est la première chose à dire.
 */
const FEATURES: { title: string; text: string }[] = [
  {
    title: 'Toutes vos sources, réunies',
    text: 'Branchez votre abonnement Xtream ou vos playlists M3U. LCR TV les rassemble en un seul catalogue, cherchable et rangé — le direct, les films, les séries.',
  },
  {
    title: 'Un profil par personne',
    text: 'Le compte, c’est le foyer. Chacun a son profil : sa liste, son historique, ses chaînes épinglées, sa langue. La reprise de lecture suit, d’un écran à l’autre.',
  },
  {
    title: 'La TV se connecte au QR',
    text: 'Sur Apple TV comme sur Android TV, un QR code s’affiche. Scannez-le avec votre téléphone pour connecter le téléviseur — sans rien taper à la télécommande.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'LCR TV fournit-il des chaînes ou des films ?',
    a: 'Non. LCR TV est une application de lecture : elle n’héberge et ne fournit aucun contenu. Vous y branchez votre propre abonnement ou vos propres playlists.',
  },
  {
    q: 'Sur quels appareils ?',
    a: 'iPhone, iPad, Apple TV, Android et Fire TV — une seule application, un seul compte. Le site web, lui, sert à présenter l’app et à activer un téléviseur.',
  },
  {
    q: 'Comment se connecter sur le téléviseur ?',
    a: 'La TV affiche un QR code ; vous le scannez avec votre téléphone déjà connecté, et le téléviseur s’ouvre sur votre compte. Pas de mot de passe à saisir à la télécommande.',
  },
  {
    q: 'Combien de profils puis-je créer ?',
    a: 'Autant que le foyer en a besoin. Chaque profil garde ses favoris, son historique et ses réglages, séparément des autres.',
  },
];

export default function Landing() {
  return (
    <main className="lp">
      <header className="lp-top">
        <span className="lp-brand">
          <BrandMark size={22} />
          LCR TV
        </span>
        <nav className="lp-topnav">
          <Link href="/tv" className="lp-signin">
            Associer une TV
          </Link>
        </nav>
      </header>

      {/* ------------------------------------------------------------- hero */}
      <section className="lp-hero">
        <h1 className="lp-title">
          Toute votre télévision,
          <br />
          sur tous vos écrans.
        </h1>
        <p className="lp-disclaimer">
          LCR TV est une application de lecture : elle ne fournit aucun contenu. Vous y branchez
          votre propre abonnement.
        </p>

        <div className="lp-stores">
          <StoreBadge kind="apple" top="Télécharger dans" name="l’App Store" />
          <StoreBadge kind="google" top="Disponible sur" name="Google Play" />
        </div>
        <p className="lp-soon">Bientôt sur les magasins — iPhone · iPad · Apple TV · Android · Fire TV</p>

        {/* Les vrais écrans, dans des téléphones. */}
        <div className="lp-devices" aria-hidden>
          <span className="lp-glow" />
          <img className="lp-device lp-device-left" src="/shots/direct.png" alt="" />
          <img className="lp-device lp-device-main" src="/shots/accueil.png" alt="" />
          <img className="lp-device lp-device-right" src="/shots/profils.png" alt="" />
        </div>
      </section>

      {/* --------------------------------------------------------- features */}
      <section className="lp-features">
        {FEATURES.map((f) => (
          <article key={f.title} className="lp-feature">
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      {/* -------------------------------------------------------------- faq */}
      <section className="lp-faq">
        <h2>Questions fréquentes</h2>
        <div className="lp-faq-list">
          {FAQ.map((item) => (
            <details key={item.q} className="lp-faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- footer */}
      <footer className="lp-footer">
        <span className="lp-brand">
          <BrandMark size={22} />
          LCR TV
        </span>
        <nav>
          <Link href="/tv">Associer une TV</Link>
          <Link href="/login">Connexion</Link>
          <Link href="/inscription">Créer un compte</Link>
        </nav>
        <span className="lp-copy">© {new Date().getFullYear()} LCR TV · Lecteur, sans contenu fourni</span>
      </footer>
    </main>
  );
}

/** Un badge de magasin, en attente des vrais liens : il annonce la plateforme
 *  sans promettre un lien qui n'existe pas encore. */
function StoreBadge({ kind, top, name }: { kind: 'apple' | 'google'; top: string; name: string }) {
  return (
    <span className="lp-badge" aria-disabled>
      {kind === 'apple' ? (
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden>
          <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 2.99-.78.9-2.06 1.6-3.12 1.52-.13-1.1.42-2.27 1.1-3.02.76-.84 2.1-1.48 3.14-1.49zM20.5 17.1c-.57 1.32-.85 1.9-1.59 3.06-1.03 1.63-2.48 3.65-4.28 3.66-1.6.02-2.01-1.04-4.18-1.03-2.17.01-2.62 1.05-4.22 1.04-1.8-.02-3.17-1.85-4.2-3.47C-.9 17.9-1.2 12.8 1.08 10.1c.98-1.18 2.52-1.93 3.98-1.93 1.49 0 2.42 1.04 3.65 1.04 1.2 0 1.93-1.04 3.65-1.04 1.3 0 2.67.71 3.65 1.93-3.2 1.76-2.68 6.33.49 7.98z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
          <path d="M3.6 2.3 13.4 12 3.6 21.7a1.9 1.9 0 0 1-.4-1.2V3.5c0-.45.15-.86.4-1.2z" fill="#34d399" />
          <path d="M16.9 8.5 13.4 12l3.5 3.5 3.3-1.9c1.1-.65 1.1-2.25 0-2.9z" fill="#fbbf24" />
          <path d="M3.6 2.3c.33-.45.95-.57 1.5-.26l11.8 6.46-3.5 3.5z" fill="#60a5fa" />
          <path d="M13.4 12 3.6 21.7c.37.5 1 .6 1.5.3l11.8-6.5z" fill="#f87171" />
        </svg>
      )}
      <span className="lp-badge-txt">
        <span className="lp-badge-top">{top}</span>
        <span className="lp-badge-name">{name}</span>
      </span>
    </span>
  );
}
