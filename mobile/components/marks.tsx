import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native';
import type { CategoryIcon, LanguageTag, TopicKey } from '@iptv/shared';
import { colors } from '../lib/theme';

/*
 * Icones de categories, cote mobile.
 *
 * `@expo/vector-icons` est deja une dependance : ses tracés sont de vraies
 * icones, avec une graisse et une couleur qu'on controle, la ou un « ★ » ou un
 * « ⚽ » depend de la police du systeme et change d'un telephone a l'autre.
 * Le web dessine les memes formes en SVG ; les deux fronts restent lisibles de
 * la meme facon sans partager de composant, ce qui n'aurait pas de sens entre
 * DOM et natif.
 */

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type MaterialName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const IONICON: Partial<Record<TopicKey, IoniconName>> = {
  football: 'football-outline',
  sport: 'trophy-outline',
  music: 'musical-notes-outline',
  cinema: 'film-outline',
  screen: 'tv-outline',
};

const MATERIAL: Partial<Record<TopicKey, MaterialName>> = {
  motorsport: 'flag-checkered',
  cricket: 'cricket',
  christmas: 'pine-tree',
  comedy: 'drama-masks',
};

export function IconStar({
  filled,
  size = 14,
  color,
}: {
  filled: boolean;
  size?: number;
  color?: string;
}) {
  return (
    <Ionicons
      name={filled ? 'star' : 'star-outline'}
      size={size}
      color={color ?? (filled ? colors.gold : colors.faint)}
    />
  );
}

/** L'horloge de « vus recemment », comme l'etoile de « ma liste ». */
export function IconClock({ size = 14, color }: { size?: number; color?: string }) {
  return <Ionicons name="time-outline" size={size} color={color ?? colors.faint} />;
}

function Topic({ topic, size, color }: { topic: TopicKey; size: number; color: string }) {
  const ion = IONICON[topic];
  if (ion) return <Ionicons name={ion} size={size} color={color} />;
  const mat = MATERIAL[topic];
  if (mat) return <MaterialCommunityIcons name={mat} size={size} color={color} />;
  return <Ionicons name="tv-outline" size={size} color={color} />;
}

/**
 * Ce qui precede le nom d'une categorie : drapeau, theme, ou globe.
 *
 * Le drapeau reste un emoji — c'est le seul cas ou l'emoji **est** l'icone, et
 * dessiner soixante drapeaux a la main les rendrait tous approximatifs.
 */
export function CategoryMark({
  icon,
  size = 14,
  color = colors.dim,
}: {
  icon: CategoryIcon;
  size?: number;
  color?: string;
}) {
  if (icon.kind === 'flag') return <Text style={{ fontSize: size }}>{icon.flag}</Text>;
  if (icon.kind === 'globe') {
    return <Ionicons name="globe-outline" size={size} color={color} />;
  }
  return <Topic topic={icon.topic} size={size} color={color} />;
}

/**
 * Marqueur de langue devant un titre : drapeau, ou globe pour une region.
 *
 * Rend `null` quand le libelle ne porte aucune langue reconnue — une absence est
 * une information, il ne faut pas la combler par un symbole neutre.
 */
export function LanguageMark({
  tag,
  size = 13,
  color = colors.dim,
}: {
  tag: LanguageTag | null;
  size?: number;
  color?: string;
}) {
  if (!tag) return null;
  if (tag.flag) return <Text style={{ fontSize: size }}>{tag.flag}</Text>;
  return <Ionicons name="globe-outline" size={size} color={color} />;
}
