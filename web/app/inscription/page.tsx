'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SignupPolicy } from '@iptv/shared';
import { api, ApiError } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { AuthArt } from '../../components/AuthArt';
import { Button, ButtonLink, Field, PasswordField } from '../../components/kit';

/** Même exigence qu'au changement de mot de passe : dix caractères. */
const MIN_PASSWORD = 10;

/**
 * Création de compte.
 *
 * Un formulaire d'inscription est un contrat : il faut savoir ce qu'on signe.
 * Ici on signe pour trois écrans — le compte, puis son abonnement, puis qui
 * regarde — et les annoncer coûte une ligne. Personne ne se demande plus,
 * après, pourquoi l'accueil est vide : chaque compte apporte son abonnement,
 * et c'est l'écran suivant.
 */
export default function SignupPage() {
  const t = useT();
  const router = useRouter();
  const { user, loading, refresh } = useSession();

  const [policy, setPolicy] = useState<SignupPolicy | null>(null);
  const [email, setEmail] = useState('');
  const [profileName, setProfileName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  useEffect(() => {
    api
      .get<SignupPolicy>('/api/auth/signup-policy')
      .then(setPolicy)
      .catch(() => setPolicy({ mode: 'open' }));
  }, []);

  /*
   * Les deux saisies sont comparées ici et pas seulement au serveur : il ne
   * voit qu'un mot de passe et ne peut pas savoir qu'on a voulu en taper un
   * autre. Les exigences se cochent en tapant — la règle avant la faute.
   */
  const longEnough = password.length >= MIN_PASSWORD;
  const same = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mismatch || !longEnough) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/signup', {
        email,
        password,
        profileName: profileName.trim() || undefined,
        code: code || undefined,
        transport: 'cookie',
      });
      await refresh();
      // S'inscrire, c'est créer un compte, rien de plus : on entre dans
      // l'application. L'abonnement et les profils se font ensuite, quand on
      // veut, depuis le compte — ce n'est pas une étape de l'inscription.
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('Inscription impossible. Le backend répond-il ?'),
      );
    } finally {
      setBusy(false);
    }
  }

  const art = (
    <AuthArt
      title={t('Trois écrans, et ça marche.')}
      text={t(
        'Créez votre compte. Vous brancherez vos chaînes et vos profils ensuite — chaque foyer apporte son propre abonnement.',
      )}
    />
  );

  if (policy?.mode === 'closed') {
    return (
      <div className="auth">
        {art}
        <div className="auth-form">
          <h1>{t('Inscriptions fermées')}</h1>
          <p className="auth-lede">
            {t(
              'Cette installation ne crée pas de compte en libre-service. Demandez-en un à l’administrateur.',
            )}
          </p>
          <ButtonLink size="lg" block href="/login">
            {t('Retour à la connexion')}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      {art}

      <form className="auth-form" onSubmit={onSubmit}>
        <h1>{t('Créer un compte')}</h1>
        <p className="auth-lede">
          {t('Juste un compte pour votre foyer. Vous ajouterez vos chaînes et vos profils une fois à l’intérieur.')}
        </p>

        {error && <div className="notice notice-error">{error}</div>}

        <Field
          label={t('Adresse e-mail')}
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Field
          label={t('Prénom du premier profil')}
          autoComplete="given-name"
          maxLength={24}
          placeholder={t('Facultatif — sinon tiré de l’adresse')}
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
        />

        <PasswordField
          label={t('Mot de passe')}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          reveal={reveal}
          onReveal={() => setReveal((r) => !r)}
          revealLabels={[t('Masquer le mot de passe'), t('Afficher le mot de passe')]}
          note={
            <span className="checks">
              <span data-ok={longEnough || undefined}>
                {longEnough ? '✓' : '·'} {t('{min} caractères', { min: MIN_PASSWORD })}
              </span>
              <span data-ok={same || undefined}>
                {same ? '✓' : '·'} {t('les deux identiques')}
              </span>
            </span>
          }
        />

        <Field
          label={t('Confirmation')}
          type={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          required
          error={mismatch ? t('Les deux mots de passe diffèrent.') : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {policy?.mode === 'code' && (
          <Field
            label={t('Code d’invitation')}
            required
            autoComplete="off"
            note={t('Cette installation demande un code : votre administrateur vous l’a donné.')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={mismatch || !longEnough}
          busy={busy}
          busyLabel={t('Création…')}
        >
          {t('Créer mon compte')}
        </Button>

        <p className="auth-alt">
          {t('Déjà un compte ?')} <Link href="/login">{t('Se connecter')}</Link>
        </p>
      </form>
    </div>
  );
}
