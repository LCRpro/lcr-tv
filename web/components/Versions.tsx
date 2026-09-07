'use client';

import { parseVariant, type Variant } from '@iptv/shared';
import { useT } from '../lib/i18n';
import { LanguageMark } from './marks';

/**
 * Les versions d'une œuvre, en une ligne de pastilles.
 *
 * Le fournisseur publie le même film une vingtaine de fois — une ligne par
 * langue, par qualité, par sous-titrage. Le choix vivait dans un panneau à
 * deux étages posé **avant** le bouton Lire ; personne ne choisit une version
 * avant d'avoir lu de quoi ça parle. Il tient maintenant en une ligne, après
 * les gestes : la langue, la qualité, le format — et l'avertissement « pas
 * dans un navigateur » sur la pastille qui le mérite, pas en note grise plus
 * bas dans la page.
 *
 * Une série n'a pas de format à ce niveau : ses pastilles ne portent que la
 * langue, et changer de langue change la liste des épisodes.
 */
export function Versions({
  variants,
  selectedId,
  onSelect,
}: {
  variants: Variant[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  const t = useT();
  if (variants.length === 0) return null;
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0]!;

  return (
    <div className="versions-wrap">
      <div className="versions" role="radiogroup" aria-label={t('Version')}>
        <span className="versions-k">{t('Version')}</span>
        {variants.map((v) => {
          const p = parseVariant(v.name);
          const bits = [p.quality, v.containerExtension?.toUpperCase(), ...p.tags].filter(Boolean);
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={v.id === selected.id}
              className="version"
              data-on={v.id === selected.id || undefined}
              onClick={() => onSelect(v.id)}
              title={v.name}
            >
              <LanguageMark tag={p.tag} />
              {t(p.tag?.label ?? 'Langue inconnue')}
              {bits.length > 0 && <small>· {bits.join(' · ')}</small>}
              {!v.browserPlayable && <em>{t('pas dans un navigateur')}</em>}
            </button>
          );
        })}
      </div>
      {!selected.browserPlayable && (
        <p className="notice notice-warn versions-note">
          {t(
            'Cette version est un {ext} : le navigateur ne sait pas la décoder. Elle se lit depuis l’application mobile — choisissez-en une autre si elle existe.',
            { ext: (selected.containerExtension ?? '').toUpperCase() },
          )}
        </p>
      )}
    </div>
  );
}
