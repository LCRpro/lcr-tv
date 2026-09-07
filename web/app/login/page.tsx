'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SignupPolicy } from '@iptv/shared';
import { api, ApiError } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { AuthArt } from '../../components/AuthArt';
import { Button, Field, PasswordField } from '../../components/kit';

/**
 * La connexion.
 *
 * Le formulaire ne change pas de nature : il change de voisin. À gauche, les
 * affiches du catalogue ; à droite, l'adresse, le mot de passe avec son œil,
 * et l'erreur sous le champ qu'elle concerne plutôt qu'au-dessus de tout.
 */
export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const { user, loading, refresh } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState<SignupPolicy | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  /*
   * Le lien d'inscription n'apparaît que si elle est possible.
   *
   * Le proposer sur une installation fermée mène à une page qui ne fait que
   * dire non — autant ne pas l'annoncer. Sans réponse du serveur, on ne montre
   * rien : mieux vaut un lien manquant qu'une promesse fausse.
   */
  useEffect(() => {
    api
      .get<SignupPolicy>('/api/auth/signup-policy')
      .then(setPolicy)
      .catch(() => setPolicy({ mode: 'closed' }));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/login', { email, password, transport: 'cookie' });
      await refresh();
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('Connexion impossible. Le backend répond-il ?'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <AuthArt
        title={t('Votre télévision, chez vous, sur tout.')}
        text={t(
          'Vos abonnements, vos chaînes numérotées, vos films et séries — un compte par foyer, un profil par personne.',
        )}
      />

      <form className="auth-form" onSubmit={onSubmit}>
        <h1>{t('Connexion')}</h1>
        <p className="auth-lede">{t('Avec l’adresse et le mot de passe du compte.')}</p>

        <Field
          label={t('Adresse e-mail')}
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <PasswordField
          label={t('Mot de passe')}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          reveal={reveal}
          onReveal={() => setReveal((r) => !r)}
          revealLabels={[t('Masquer le mot de passe'), t('Afficher le mot de passe')]}
          error={error ?? undefined}
        />

        {/* `type="submit"` : le bouton du kit est un bouton ordinaire par défaut,
            et un formulaire à deux champs sans bouton de soumission ne se
            soumet ni au clic ni à la touche Entrée. */}
        <Button type="submit" variant="primary" size="lg" block busy={busy} busyLabel={t('Connexion…')}>
          {t('Se connecter')}
        </Button>

        {policy && policy.mode !== 'closed' && (
          <p className="auth-alt">
            {t('Pas encore de compte ?')} <Link href="/inscription">{t('Créer un compte')}</Link>
          </p>
        )}
      </form>
    </div>
  );
}
