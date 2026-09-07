'use client';

import { ButtonLink } from './kit';

import Link from 'next/link';
import { useT } from '../lib/i18n';

/**
 * Compte sans abonnement : il n'y a rien à attendre.
 *
 * À distinguer d'un catalogue en cours de remplissage. Montrer une barre de
 * progression à quelqu'un qui vient de s'inscrire promettrait un catalogue qui
 * n'arrivera jamais — personne n'a encore donné d'abonnement à synchroniser.
 * La page ne propose donc qu'une chose, et le dit sans détour.
 */
export function NoProvider() {
  const t = useT();
  return (
    <div className="onboard">
      <div className="onboard-mark" aria-hidden>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="4.5" width="19" height="13" rx="2.5" />
          <path d="M8 21h8M12 17.5V21" />
        </svg>
      </div>

      <h1>{t('Ajoutez votre abonnement')}</h1>
      <p>
        {t(
          'Votre compte est créé. Il ne lui manque que l’accès à votre panel IPTV : c’est lui qui apporte les chaînes, les films et les séries que vous verrez ici.',
        )}
      </p>

      <ButtonLink variant="primary" href="/abonnements">
        {t('Ajouter un abonnement')}
      </ButtonLink>

      <ul className="onboard-notes">
        <li>
          {t(
            'Vos identifiants sont chiffrés avant d’être stockés et ne ressortent jamais de la base — pas même pour un administrateur.',
          )}
        </li>
        <li>
          {t(
            'Votre catalogue n’appartient qu’à vous : les autres comptes de cette installation ne le voient pas, et vous ne voyez pas le leur.',
          )}
        </li>
        <li>
          {t(
            'Les connexions simultanées comptées sont celles de votre abonnement, pas celles d’un pot commun.',
          )}
        </li>
      </ul>
    </div>
  );
}
