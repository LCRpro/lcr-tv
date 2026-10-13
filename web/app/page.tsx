'use client';

/*
 * i18n-ignore-file — la vitrine est en français pour l'instant. Son texte ne
 * passe pas par `t()` : une page marketing se traduit à part, le jour où on la
 * lance dans une autre langue. Le reste de l'application, lui, reste vérifié.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';

/**
 * La vitrine — la seule page publique du web.
 *
 * Le produit, ce sont les applications ; le web ne les remplace pas, il les
 * présente et, demain, mène aux magasins. Une page, pas une arborescence :
 * ce qu'on vient y chercher, c'est comprendre ce que fait LCR TV et sur quels
 * écrans, puis télécharger. L'accès au compte et l'activation d'un téléviseur
 * vivent en bas, discrètement — ce ne sont pas ce qu'on vient voir d'abord.
 *
 * Le fond est le même parti pris que partout : l'affiche porte la couleur, la
 * nuit indigo porte le reste. Les affiches viennent de la route publique qui
 * ne renvoie que des images TMDB.
 */
const PLATFORMS = ['iPhone', 'iPad', 'Apple TV', 'Android', 'Fire TV'] as const;

const FEATURES: { title: string; text: string }[] = [
  {
    title: 'Un compte, plusieurs profils',
    text: 'Le compte, c’est le foyer. Chaque personne a son profil : sa liste, son historique, ses chaînes épinglées, sa langue.',
  },
  {
    title: 'Toutes vos sources, au même endroit',
    text: 'Branchez votre abonnement Xtream ou vos playlists M3U. LCR TV les réunit en un seul catalogue, cherchable et rangé.',
  },
  {
    title: 'Direct, films et séries',
    text: 'Les chaînes en direct, un catalogue de films et de séries avec affiches et synopsis, et la reprise de lecture là où vous vous étiez arrêté.',
  },
  {
    title: 'La TV se connecte au QR',
    text: 'Sur Apple TV comme sur Android TV, un QR code s’affiche : scannez-le avec votre téléphone pour connecter le téléviseur, sans rien taper à la télécommande.',
  },
];

const STEPS: { n: string; title: string; text: string }[] = [
  { n: '1', title: 'Créez un compte', text: 'Une adresse, un mot de passe. C’est le compte du foyer.' },
  { n: '2', title: 'Branchez vos sources', text: 'Votre abonnement ou vos playlists, depuis l’application.' },
  { n: '3', title: 'Regardez partout', text: 'Téléphone, tablette, téléviseur — tout suit votre profil.' },
];

export default function Landing() {
  const [posters, setPosters] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: string[] }>('/api/auth/mosaic')
      .then((res) => {
        if (!cancelled) setPosters(res.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="lp">
      <header className="lp-top">
        <span className="lp-brand">
          <i className="lp-mark" aria-hidden>
            L
          </i>
          LCR TV
        </span>
        <nav className="lp-topnav">
          <Link href="/login" className="lp-signin">
            Se connecter
          </Link>
        </nav>
      </header>

      {/* ------------------------------------------------------------- hero */}
      <section className="lp-hero">
        <div className="lp-mosaic" aria-hidden>
          {posters.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" loading="lazy" />
          ))}
        </div>
        <span className="lp-veil" aria-hidden />

        <div className="lp-hero-body">
          <h1>
            Toute votre télévision,
            <br />
            sur tous vos écrans.
          </h1>
          <p className="lp-lede">
            Vos abonnements, vos chaînes numérotées, vos films et séries — réunis dans une seule
            application. Un compte pour le foyer, un profil par personne.
          </p>

          <div className="lp-stores">
            <StoreButton store="App Store" sub="iPhone · iPad" />
            <StoreButton store="Google Play" sub="Android" />
            <StoreButton store="Apple TV" sub="tvOS" />
          </div>
          <p className="lp-soon">Bientôt sur les magasins · un compte, tous vos écrans.</p>
        </div>
      </section>

      {/* -------------------------------------------------------- plateformes */}
      <section className="lp-strip">
        <span className="lp-strip-label">Une seule app</span>
        <ul>
          {PLATFORMS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
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

      {/* ------------------------------------------------------ comment ça marche */}
      <section className="lp-steps">
        <h2>Comment ça marche</h2>
        <ol>
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="lp-step-n">{s.n}</span>
              <div>
                <h4>{s.title}</h4>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------- footer */}
      <footer className="lp-footer">
        <span className="lp-brand">
          <i className="lp-mark" aria-hidden>
            L
          </i>
          LCR TV
        </span>
        <nav>
          <Link href="/login">Se connecter</Link>
          <Link href="/inscription">Créer un compte</Link>
        </nav>
        <span className="lp-copy">© {new Date().getFullYear()} LCR TV</span>
      </footer>
    </main>
  );
}

/** Un bouton de magasin, en attente des vrais liens : il annonce la plateforme
 *  sans promettre un lien qui n'existe pas encore. */
function StoreButton({ store, sub }: { store: string; sub: string }) {
  return (
    <span className="lp-store" aria-disabled>
      <span className="lp-store-sub">{sub}</span>
      <span className="lp-store-name">{store}</span>
    </span>
  );
}
