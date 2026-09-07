'use client';

import type { ReactNode } from 'react';
import { useT } from '../../../lib/i18n';
import { useSession } from '../../../lib/session';

/*
 * Il ne reste que les comptes.
 *
 * La synchronisation, la grille TV et les lectures en cours appartiennent
 * maintenant à chaque compte — chacun gère les siennes depuis son menu, et les
 * versions globales ne servaient plus qu'à dupliquer ces écrans. Les travaux de
 * fond tournent seuls chaque nuit.
 *
 * Sans onglets, la page se suffit à elle-même : ce fichier ne garde que le
 * garde-fou d'accès.
 */

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const t = useT();

  // Le backend refuse deja tout appel non-admin ; ceci evite d'afficher une
  // page qui ne se remplira jamais.
  if (user && user.role !== 'admin') {
    return <div className="notice notice-error">{t('Réservé aux administrateurs.')}</div>;
  }

  return <>{children}</>;
}
