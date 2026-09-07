'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * La moitié gauche de la connexion et de l'inscription.
 *
 * Une carte au milieu d'un fond vide disait « application » ; les affiches du
 * catalogue disent « télévision ». C'est le seul écran que voit quelqu'un qui
 * n'a pas encore de compte, et il doit montrer ce qu'il y a derrière. Le
 * contenu est la seule couleur que l'application s'autorise — autant s'en
 * servir là où elle n'a rien d'autre à montrer.
 *
 * Les affiches viennent d'une route publique qui ne renvoie que des images
 * hébergées par TMDB : rien qui identifie un fournisseur. Sans catalogue —
 * une installation neuve — le panneau garde la marque et la phrase, seuls.
 */
export function AuthArt({ title, text }: { title: string; text: string }) {
  const [posters, setPosters] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: string[] }>('/api/auth/mosaic')
      .then((res) => {
        if (!cancelled) setPosters(res.items);
      })
      .catch(() => {
        // Décoratif : sans affiches, le panneau reste lisible.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="auth-art" aria-hidden>
      {posters.length > 0 && (
        <div className="auth-mosaic">
          {posters.map((src) => (
            // Hôtes d'images connus (TMDB) mais pas configurés dans next/image : <img> brut.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" loading="lazy" />
          ))}
        </div>
      )}
      <span className="auth-veil" />
      <div className="auth-say">
        <span className="brand">LCR TV</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}
