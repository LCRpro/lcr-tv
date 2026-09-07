'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Le trait de chargement sous la barre de navigation.
 *
 * Cliquer un onglet ne produisait rien de visible pendant une à trois
 * secondes : l'écran restait sur la page précédente, et le clic semblait
 * perdu. Les `loading.tsx` couvrent l'attente une fois la navigation lancée ;
 * ce trait couvre l'instant d'avant, quand le navigateur charge encore le code
 * du segment et qu'aucun squelette n'existe pour le dire.
 *
 * On écoute le clic plutôt que la navigation elle-même : le routeur de l'App
 * Router n'expose pas d'état « en cours » avant Next 15.3, et attendre que
 * `pathname` change reviendrait à n'afficher le trait qu'une fois l'attente
 * terminée.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  // La nouvelle page est là : le trait a fini son office.
  useEffect(() => {
    setActive(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Clic modifié ou secondaire : le navigateur ouvre un onglet, la page
      // courante ne bouge pas.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const link = (e.target as HTMLElement | null)?.closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || link.target === '_blank') return;
      // Externe, ancre, ou la page où l'on est déjà : rien à attendre.
      if (!href.startsWith('/') || href === pathname) return;
      setActive(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [pathname]);

  if (!active) return null;
  return <div className="nav-progress" aria-hidden />;
}
