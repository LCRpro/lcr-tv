/**
 * Les blocs : la strate au-dessus du kit.
 *
 * Le kit ignore ce qu'est un film — il connaît un bouton, un champ, une boîte.
 * Les blocs, eux, connaissent le catalogue : une page a un titre et un
 * décompte, elle attend, elle est vide, ou elle montre quelque chose. Ce sont
 * ces trois états qui étaient réécrits treize fois.
 *
 * Les compositions propres à un seul écran restent dans `ui.tsx`.
 */
export { Page, ErrorBand, EmptyState, Toolbar, EmptyAction } from './Page';
export { SettingRow } from './SettingRow';
export { TonightBlock } from './Tonight';
export { Chips, type ChipItem } from './Chips';
export { CategorySidebar, type CategorySelection } from './CategorySidebar';
export { Rail } from './Rail';
