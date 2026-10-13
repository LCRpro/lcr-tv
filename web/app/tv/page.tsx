'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useT } from '../../lib/i18n';
import { AuthArt } from '../../components/AuthArt';
import { Button, Field, PasswordField } from '../../components/kit';

/**
 * Associer un téléviseur.
 *
 * C'est la page qu'ouvre le QR affiché par la TV — d'où le code déjà dans
 * l'adresse. Deux cas, un seul écran : connecté, on réclame le code tout de
 * suite ; sinon, on se connecte et on réclame dans la foulée. La TV, qui sonde,
 * s'ouvre alors toute seule. C'est l'entrée du web depuis que l'application est
 * le produit : on ne vient pas y regarder, on vient brancher un écran.
 */
function AssociateTv() {
  const t = useT();
  const params = useSearchParams();
  const { user, refresh } = useSession();

  const [code, setCode] = useState(params.get('code') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Pas connecté : on ouvre la session d'abord, dans le même geste.
      if (!user) {
        await api.post('/api/auth/login', { email, password, transport: 'cookie' });
        await refresh();
      }
      const res = await api.post<{ deviceLabel: string | null }>('/api/tv/claim', { code });
      setDone(res.deviceLabel ?? t('votre téléviseur'));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('Association impossible. Le backend répond-il ?'),
      );
    } finally {
      setBusy(false);
    }
  }

  const art = (
    <AuthArt
      title={t('Un écran de plus.')}
      text={t(
        'Le téléviseur affiche un code. Saisissez-le ici : il s’ouvre sur votre compte, sans rien taper à la télécommande.',
      )}
    />
  );

  if (done) {
    return (
      <div className="auth">
        {art}
        <div className="auth-form">
          <h1>{t('Téléviseur associé')}</h1>
          <p className="auth-lede">
            {t('Revenez à votre téléviseur : il s’ouvre tout seul sur votre compte.')}
          </p>
          <Link href="/" className="lp-signin" style={{ display: 'inline-block', marginTop: 8 }}>
            {t('Retour à l’accueil')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      {art}
      <form className="auth-form" onSubmit={onSubmit}>
        <h1>{t('Associer un téléviseur')}</h1>
        <p className="auth-lede">
          {user
            ? t('Saisissez le code affiché sur votre téléviseur.')
            : t('Saisissez le code, puis connectez-vous — le téléviseur s’associe à votre compte.')}
        </p>

        {error && <div className="notice notice-error">{error}</div>}

        <Field
          label={t('Code du téléviseur')}
          autoComplete="off"
          autoCapitalize="characters"
          required
          autoFocus
          placeholder={t('K7P2-9QMX')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />

        {!user && (
          <>
            <Field
              label={t('Adresse e-mail')}
              type="email"
              autoComplete="username"
              required
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
            />
          </>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={code.trim().length < 4}
          busy={busy}
          busyLabel={t('Association…')}
        >
          {user ? t('Associer ce téléviseur') : t('Se connecter et associer')}
        </Button>

        {!user && (
          <p className="auth-alt">
            {t('Pas encore de compte ?')} <Link href="/inscription">{t('Créer un compte')}</Link>
          </p>
        )}
      </form>
    </div>
  );
}

export default function TvPage() {
  // `useSearchParams` impose une frontière de suspense côté App Router.
  return (
    <Suspense fallback={null}>
      <AssociateTv />
    </Suspense>
  );
}
