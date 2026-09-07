import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProfileAvatar, ProfileColor } from '@iptv/shared';

/*
 * Vignette de profil.
 *
 * Le web la dessine en SVG ; ici on prend l'icone equivalente d'un jeu deja
 * embarque plutot que d'ajouter `react-native-svg` pour dix chemins. Le couple
 * couleur + motif reste le meme des deux cotes : c'est lui qui sert de repere,
 * pas le prenom ecrit dessous.
 */
const ICONS: Record<ProfileAvatar, keyof typeof Ionicons.glyphMap> = {
  wave: 'water',
  star: 'star',
  bolt: 'flash',
  moon: 'moon',
  leaf: 'leaf',
  flame: 'flame',
  ghost: 'skull',
  crown: 'ribbon',
  rocket: 'rocket',
  heart: 'heart',
};

/** Memes teintes que le web, a l'identique : un profil doit se reconnaitre d'un
 *  ecran a l'autre. */
const TINTS: Record<ProfileColor, string> = {
  cyan: '#22d3ee',
  violet: '#a78bfa',
  rose: '#fb7185',
  amber: '#fbbf24',
  emerald: '#4ade80',
  blue: '#60a5fa',
};

export function Avatar({
  avatar,
  color,
  size = 88,
}: {
  avatar: ProfileAvatar;
  color: ProfileColor;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.19,
        backgroundColor: TINTS[color] ?? TINTS.cyan,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={ICONS[avatar] ?? 'water'}
        size={size * 0.5}
        // Encre profonde et non blanche : les teintes sont claires, un glyphe
        // blanc s'y effacerait.
        color="rgba(6, 20, 26, 0.82)"
      />
    </View>
  );
}
