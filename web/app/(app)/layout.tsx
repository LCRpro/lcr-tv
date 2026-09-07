'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '../../lib/session';
import { useT } from '../../lib/i18n';
import { ConnectionBadge } from '../../components/ConnectionBadge';
import { QuickSearch } from '../../components/QuickSearch';
import { Boot } from '../../components/ui';
import { Avatar } from '../../components/Avatar';
import { NavProgress } from '../../components/NavProgress';

/**
 * Ce qui mérite un lien permanent : ce qu'on parcourt.
 *
 * Le compte, l'historique et l'administration ne se visitent pas en boucle —
 * ils vivent dans le menu du compte, à droite. La recherche n'est plus une
 * destination non plus : c'est un champ, pas une page.
 */
const LINKS = [
  { href: '/', label: 'Accueil', exact: true },
  { href: '/live', label: 'Live' },
  { href: '/films', label: 'Films' },
  { href: '/series', label: 'Séries' },
  { href: '/ma-liste', label: 'Ma liste' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, profiles, loading, logout, leaveProfile } = useSession();
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();

  const [menu, setMenu] = useState(false);
  const [burger, setBurger] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    /*
     * Connecté mais sans profil : on passe par le sélecteur.
     *
     * Le catalogue entier est rattaché à un profil — favoris, progression,
     * chaînes épinglées. Sans réponse à « qui regarde ? », l'API répond 409 sur
     * chaque page ; mieux vaut poser la question que montrer des erreurs.
     */
    if (!profile) router.replace('/profils');
  }, [loading, user, profile, router]);

  // Changer de page referme tout : un panneau resté ouvert par-dessus la
  // nouvelle page donne l'impression que la navigation n'a pas eu lieu.
  useEffect(() => {
    setMenu(false);
    setBurger(false);
  }, [pathname]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (loading) return <Boot />;
  if (!user || !profile) return null;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const links = (
    <>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} data-active={isActive(l.href, l.exact)}>
          {t(l.label)}
        </Link>
      ))}
    </>
  );

  return (
    <>
      <header className="header">
        <button
          className="burger"
          onClick={() => setBurger((b) => !b)}
          aria-expanded={burger}
          aria-label={t('Menu')}
        >
          <IconBurger open={burger} />
        </button>

        <Link className="brand" href="/">
          LCR TV
        </Link>

        <nav className="nav">{links}</nav>

        <QuickSearch />

        <div className="header-right">
          <ConnectionBadge />

          <div className="account" ref={menuRef}>
            <button
              className="account-btn"
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              aria-label={t('Compte — {name}', { name: profile.name })}
              title={`${profile.name} · ${user.email}`}
            >
              <Avatar avatar={profile.avatar} color={profile.color} size={32} />
            </button>

            {menu && (
              <div className="account-menu" role="menu">
                {/* Qui regarde, avant tout le reste : c'est ce qu'on vient
                    vérifier quand on ouvre ce menu sur un écran partagé. */}
                <div className="account-who">
                  <Avatar avatar={profile.avatar} color={profile.color} size={34} />
                  <span>
                    <b>{profile.name}</b>
                    <em>{user.email}</em>
                  </span>
                </div>
                <button role="menuitem" onClick={() => void leaveProfile()}>
                  {t('Changer de profil')}
                </button>
                <Link href="/compte" role="menuitem">
                  {t('Mon profil')}
                </Link>
                <Link href="/abonnements" role="menuitem">
                  {t('Mes abonnements')}
                </Link>
                <Link href="/historique" role="menuitem">
                  {t('Historique')}
                </Link>
                {user.role === 'admin' && (
                  <Link href="/admin/users" role="menuitem">
                    {t('Administration')}
                  </Link>
                )}
                <button role="menuitem" onClick={() => void logout()}>
                  {t('Déconnexion')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <NavProgress />

      {/* Sous 900 px les liens sortent de la barre : ils y étaient coupés, et
          les tasser davantage aurait rendu chaque cible intouchable au doigt. */}
      {burger && <nav className="burger-panel">{links}</nav>}

      <main className="page">{children}</main>
    </>
  );
}

function IconBurger({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}

