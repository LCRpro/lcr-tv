import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ProfileAvatar, ProfileColor } from '@iptv/shared';

/*
 * Vignette de profil.
 *
 * Le web la dessine en SVG ; ici on prend l'icone equivalente d'un jeu deja
 * embarque plutot que d'ajouter `react-native-svg` pour dix chemins. Le couple
 * couleur + motif reste le meme des deux cotes : c'est lui qui sert de repere,
 * pas le prenom ecrit dessous.
 *
 * Depuis la charte « Nuit indigo », la vignette est un degrade et non plus un
 * aplat clair : posee sur un fond bleu de nuit, elle a besoin de profondeur, et
 * le glyphe passe en clair. Chaque couleur est donc un couple clair -> sombre.
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

/** Memes teintes de repere que le web, declinees en degrade clair -> sombre. */
const TINTS: Record<ProfileColor, [string, string]> = {
  cyan: ['#3ad6ef', '#1b8fb0'],
  violet: ['#a78bfa', '#6d4fc9'],
  rose: ['#e06a86', '#b23a5a'],
  amber: ['#fbbf24', '#c98a0a'],
  emerald: ['#54b98c', '#2f7d5c'],
  blue: ['#6d8cff', '#3f57c9'],
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
  const pair = TINTS[color] ?? TINTS.blue;
  return (
    <LinearGradient
      colors={pair}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={ICONS[avatar] ?? 'water'}
        size={size * 0.46}
        color="rgba(255, 255, 255, 0.94)"
      />
    </LinearGradient>
  );
}

/** Le glyphe Ionicons d'une vignette — pour l'afficher à plat, sans aplat de couleur. */
export function avatarGlyph(avatar: ProfileAvatar): keyof typeof Ionicons.glyphMap {
  return ICONS[avatar] ?? 'water';
}

/** Une pastille de couleur : le dégradé de la teinte, en rond — pour le sélecteur. */
export function ColorSwatch({ color, size = 34 }: { color: ProfileColor; size?: number }) {
  const pair = TINTS[color] ?? TINTS.blue;
  return (
    <LinearGradient
      colors={pair}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}
