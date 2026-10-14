'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MAX_PROFILES,
  PROFILE_AVATARS,
  PROFILE_COLORS,
  languageTag,
  type AvatarId,
  type Profile,
  type ProfileColor,
} from '@iptv/shared';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Avatar } from '../../components/Avatar';
import { LanguagePicker } from '../../components/LanguagePicker';
import { UI_LOCALES, useT } from '../../lib/i18n';
import { Button, Dialog, Field, SelectField } from '../../components/kit';
import { Boot, ErrorNotice } from '../../components/ui';

/*
 * Chaque langue se nomme dans sa propre langue : « Allemand » ne dit rien à
 * qui ne lit pas le français, et c'est précisément la personne qui cherche
 * cette ligne.
 */
const LOCALE_NAMES: Record<(typeof UI_LOCALES)[number], string> = {
  FR: 'Français',
  EN: 'English',
  DE: 'Deutsch',
  ES: 'Español',
};

/**
 * « Qui regarde ? »
 *
 * L'écran arrive juste après la connexion et n'a ni barre de navigation ni
 * chrome : à ce moment-là il n'y a qu'une seule chose à faire. Il change peu —
 * les langues de chaque profil sous son prénom, parce que c'est ce qui
 * distingue vraiment deux profils du même foyer, et les touches qui le
 * pilotent depuis le canapé : flèches, Entrée, G.
 */
function Picker() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, profiles, loading, refresh, selectProfile } = useSession();
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const t = useT();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  /* « Mon compte » ouvre directement la bonne fiche : le lien porte l'identifiant. */
  useEffect(() => {
    if (loading) return;
    if (params.get('nouveau')) {
      setCreating(true);
      return;
    }
    const id = Number(params.get('edit'));
    const target = profiles.find((p) => p.id === id);
    if (target) {
      setManaging(true);
      setEditing(target);
    }
  }, [loading, params, profiles]);

  const choose = async (id: number) => {
    setBusy(true);
    try {
      await selectProfile(id);
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      setBusy(false);
    }
  };

  /*
   * Les touches d'un téléviseur : flèches pour choisir, Entrée pour regarder,
   * G pour gérer. Les boîtes de dialogue prennent le clavier quand elles sont
   * ouvertes — on ne bouge pas le curseur derrière elles.
   */
  const cells = profiles.length + (profiles.length < MAX_PROFILES ? 1 : 0);
  useEffect(() => {
    if (creating || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight') setCursor((c) => (c + 1) % cells);
      else if (e.key === 'ArrowLeft') setCursor((c) => (c - 1 + cells) % cells);
      else if (e.key === 'Enter') {
        e.preventDefault();
        const p = profiles[cursor];
        if (!p) setCreating(true);
        else if (managing) setEditing(p);
        else void choose(p.id);
      } else if (e.key.toLowerCase() === 'g') setManaging((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `choose` change à chaque rendu ; seuls les états qui comptent relancent l'écoute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, cursor, managing, creating, editing, profiles]);

  if (loading) return <Boot />;
  if (!user) return null;

  return (
    <main className="picker">
      <div className="picker-inner">
        <h1 className="picker-title">{t('Qui regarde ?')}</h1>
        <p className="picker-lede">
          {t('Chaque profil garde sa liste, son historique et ses chaînes épinglées.')}
        </p>

        <ErrorNotice error={error} />

        <div className="picker-grid">
          {profiles.map((p, i) => (
            <div className="picker-cell" key={p.id} data-cursor={i === cursor || undefined}>
              <button
                className="picker-pick"
                onClick={() => (managing ? setEditing(p) : void choose(p.id))}
                onMouseEnter={() => setCursor(i)}
                disabled={busy}
                aria-label={
                  managing
                    ? t('Modifier {name}', { name: p.name })
                    : t('Regarder en tant que {name}', { name: p.name })
                }
              >
                <span className="picker-face" data-managing={managing || undefined}>
                  <Avatar avatar={p.avatar} color={p.color} size={128} />
                  {managing && <span className="picker-edit">{PencilIcon}</span>}
                </span>
                <span className="picker-name">{p.name}</span>
                {/* Les langues, sous le prénom : ce qui distingue deux profils du même foyer. */}
                <span className="picker-langs" aria-label={p.languages.join(', ')}>
                  {p.languages.map((code) => (
                    <span key={code} className="flag" title={languageTag(code)?.label ?? code}>
                      {languageTag(code)?.flag ?? code}
                    </span>
                  ))}
                </span>
                {p.isKid && <span className="picker-tag">{t('Enfant')}</span>}
              </button>
            </div>
          ))}

          {profiles.length < MAX_PROFILES && (
            <div className="picker-cell" data-cursor={cursor === profiles.length || undefined}>
              <button
                className="picker-pick"
                onClick={() => setCreating(true)}
                onMouseEnter={() => setCursor(profiles.length)}
              >
                <span className="picker-face picker-add">{PlusIcon}</span>
                <span className="picker-name">{t('Ajouter')}</span>
              </button>
            </div>
          )}
        </div>

        <div className="picker-keys" aria-hidden>
          <span>
            <kbd>←</kbd>
            <kbd>→</kbd> {t('choisir')}
          </span>
          <span>
            <kbd>↵</kbd> {managing ? t('modifier') : t('regarder')}
          </span>
          <span>
            <kbd>G</kbd> {t('gérer les profils')}
          </span>
        </div>

        <Button onClick={() => setManaging((m) => !m)}>
          {managing ? t('Terminé') : t('Gérer les profils')}
        </Button>
      </div>

      {(creating || editing) && (
        <ProfileDialog
          profile={editing}
          accountAdult={user.canWatchAdult}
          canDelete={profiles.length > 1}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </main>
  );
}

/**
 * Création et modification dans la même boîte : les deux posent exactement
 * les mêmes questions.
 */
function ProfileDialog({
  profile,
  accountAdult,
  canDelete,
  onClose,
  onSaved,
}: {
  profile: Profile | null;
  accountAdult: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(profile?.avatar ?? 'wave');
  const [color, setColor] = useState<ProfileColor>(profile?.color ?? 'cyan');
  const [isKid, setIsKid] = useState(profile?.isKid ?? false);
  const [adult, setAdult] = useState(profile?.canWatchAdult ?? false);
  const [languages, setLanguages] = useState<string[]>(profile?.languages ?? ['FR']);
  const [uiLanguage, setUiLanguage] = useState<string>(profile?.uiLanguage ?? '');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      avatar,
      color,
      isKid,
      canWatchAdult: adult,
      languages,
      // La chaîne vide vaut « automatique » : le serveur attend `null`.
      uiLanguage: uiLanguage || null,
    };
    try {
      if (profile) await api.patch(`/api/profiles/${profile.id}`, body);
      else await api.post('/api/profiles', body);
      await onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      await api.del(`/api/profiles/${profile.id}`);
      await onSaved();
    } catch (err) {
      if (err instanceof ApiError) setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={profile ? t('Modifier le profil') : t('Nouveau profil')}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          {profile && canDelete && (
            <Button variant="danger" onClick={remove} disabled={busy}>
              {t('Supprimer')}
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={onClose} disabled={busy}>
            {t('Annuler')}
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()} busy={busy}>
            {profile ? t('Enregistrer') : t('Créer')}
          </Button>
        </>
      }
    >
      <div className="modal-face">
        <Avatar avatar={avatar} color={color} size={88} />
      </div>

      <Field
        label={t('Nom')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        required
        autoFocus
        placeholder={t('Prénom')}
      />

      <div className="form-group">
        <span>{t('Vignette')}</span>
        <div className="pick-row">
          {PROFILE_AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              className="pick-chip"
              data-on={a === avatar || undefined}
              onClick={() => setAvatar(a)}
              aria-label={a}
            >
              <Avatar avatar={a} color={color} size={38} />
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <span>{t('Couleur')}</span>
        <div className="pick-row">
          {PROFILE_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className="pick-chip"
              data-on={c === color || undefined}
              onClick={() => setColor(c)}
              aria-label={c}
            >
              <Avatar avatar={avatar} color={c} size={38} />
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <span>{t('Langues mises en avant')}</span>
        <p className="field-note">
          {t(
            'Jusqu’à trois, dans l’ordre. Elles passent devant partout — accueil, chaînes, films, séries, recherche. Le reste du catalogue reste accessible, simplement derrière.',
          )}
        </p>
        <LanguagePicker value={languages} onChange={setLanguages} />
      </div>

      <SelectField
        label={t('Langue de l’application')}
        note={t('Sans choix, elle suit la première de vos langues qui soit traduite.')}
        value={uiLanguage}
        onChange={(e) => setUiLanguage(e.target.value)}
      >
        <option value="">{t('Automatique')}</option>
        {UI_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </SelectField>

      <label className="check">
        <input type="checkbox" checked={isKid} onChange={(e) => setIsKid(e.target.checked)} />
        <span>
          {t('Profil enfant')}
          <em>{t('Masque les catégories adultes, quels que soient les droits du compte.')}</em>
        </span>
      </label>

      {accountAdult && !isKid && (
        <label className="check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>{t('Autoriser les catégories adultes')}</span>
        </label>
      )}

      <ErrorNotice error={error} />
    </Dialog>
  );
}

const PlusIcon = (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const PencilIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
  </svg>
);

/** `useSearchParams` impose une frontière de suspense. */
export default function ProfilesPage() {
  return (
    <Suspense fallback={<Boot />}>
      <Picker />
    </Suspense>
  );
}
