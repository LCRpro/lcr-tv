import { Image, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { isPhotoAvatar, type AvatarId, type ProfileAvatar, type ProfileColor } from '@iptv/shared';

/*
 * Les avatars photographiques, en dur.
 *
 * `require` veut un chemin littéral : on mappe donc chaque identifiant à son
 * fichier, une fois. Ajouter une photo, c'est déposer un .jpg dans
 * `assets/avatars` et l'ajouter ici comme dans `PROFILE_PHOTO_AVATARS`.
 */
const PHOTOS: Record<string, number> = {
  'cat-ginger': require('../assets/avatars/cat-ginger.jpg'),
  'cat-tabby': require('../assets/avatars/cat-tabby.jpg'),
  'cat-tuxedo': require('../assets/avatars/cat-tuxedo.jpg'),
  'cat-blackwhite': require('../assets/avatars/cat-blackwhite.jpg'),
  'cat-grey': require('../assets/avatars/cat-grey.jpg'),
  'dog-shiba': require('../assets/avatars/dog-shiba.jpg'),
  'dog-cool': require('../assets/avatars/dog-cool.jpg'),
  'dog-pup': require('../assets/avatars/dog-pup.jpg'),
  'dog-puppy': require('../assets/avatars/dog-puppy.jpg'),
  'dog-fluffy': require('../assets/avatars/dog-fluffy.jpg'),
  fox: require('../assets/avatars/fox.jpg'),
  hyena: require('../assets/avatars/hyena.jpg'),
  meerkat: require('../assets/avatars/meerkat.jpg'),
  deer: require('../assets/avatars/deer.jpg'),
  owl: require('../assets/avatars/owl.jpg'),
  'owl-eagle': require('../assets/avatars/owl-eagle.jpg'),
  tiger: require('../assets/avatars/tiger.jpg'),
  'tiger-cub': require('../assets/avatars/tiger-cub.jpg'),
  lion: require('../assets/avatars/lion.jpg'),
  'lion-roar': require('../assets/avatars/lion-roar.jpg'),
  rabbit: require('../assets/avatars/rabbit.jpg'),
};

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
  avatar: AvatarId;
  color: ProfileColor;
  size?: number;
}) {
  const radius = size * 0.24;

  // Une photo : on l'affiche telle quelle, au même galbe que les vignettes.
  if (isPhotoAvatar(avatar)) {
    const src = PHOTOS[avatar];
    if (src) {
      return (
        <Image
          source={src}
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#141824' }}
        />
      );
    }
    // Avatar de secours : photo inconnue → une empreinte sur fond neutre.
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: '#141824',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="paw" size={size * 0.44} color="rgba(255,255,255,0.5)" />
      </View>
    );
  }

  const pair = TINTS[color] ?? TINTS.blue;
  return (
    <LinearGradient
      colors={pair}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={ICONS[avatar as ProfileAvatar] ?? 'water'}
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
