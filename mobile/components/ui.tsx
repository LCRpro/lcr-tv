import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import {
  channelTitle,
  splitChannelQuality,
  splitLanguage,
  workTitle,
  type LiveChannel,
} from '@iptv/shared';
import { colors, styles } from '../lib/theme';
import { IS_TV, tv } from '../lib/tv';
import { Focusable } from './Focusable';
import { LanguageMark } from './marks';
import type { ApiError } from '../lib/api';

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={colors.accent} />
      {label ? <Text style={[styles.dim, { marginTop: 10 }]}>{label}</Text> : null}
    </View>
  );
}

export function ErrorNotice({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <View style={[styles.notice, styles.noticeError]}>
      <Text style={styles.text}>{error.message}</Text>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={{ padding: 44, alignItems: 'center' }}>
      <Text style={[styles.dim, { textAlign: 'center' }]}>{children}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  primary,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Focusable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonText, primary && styles.buttonPrimaryText]}>{label}</Text>
    </Focusable>
  );
}

/** Initiales d'un libelle, pour le repli quand le fournisseur ne donne pas de visuel. */
function initials(label: string): string {
  return label
    .split(/[\s:–-]+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

interface CardProps {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  wide?: boolean;
  progressRatio?: number | null;
  /** Avancement du programme en cours, distinct de la progression de lecture. */
  elapsedRatio?: number | null;
  badge?: string | null;
  rating?: number | null;
  /** En grille, la carte prend la largeur de sa colonne au lieu d'une taille fixe. */
  stretch?: boolean;
  /**
   * Une chaine se nettoie autrement qu'une oeuvre : sa langue fait partie de son
   * identite, sa qualite non — et c'est le suffixe de qualite qui doit sauter,
   * puisque la vignette represente toutes les declinaisons.
   */
  kind?: 'work' | 'channel';
  onPress: () => void;
}

export function Card({
  title,
  subtitle,
  imageUrl,
  wide,
  progressRatio,
  elapsedRatio,
  badge,
  rating,
  stretch,
  kind = 'work',
  onPress,
}: CardProps) {
  // Le fournisseur prefixe ses titres du code langue (« EN - … ») : un drapeau
  // dit la meme chose sans manger la moitie de la ligne. Et la carte represente
  // une oeuvre, pas une declinaison : le « [4K] » se choisit sur la fiche — dans
  // le lecteur pour une chaine.
  const { tag } = splitLanguage(title);
  const cleanTitle = kind === 'channel' ? channelTitle(title) : workTitle(title);

  // Beaucoup de visuels du fournisseur sont morts : on bascule sur les
  // initiales plutot que de laisser un rectangle vide.
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(imageUrl) && !broken;

  /*
   * Le nom se pose sur le visuel, comme sur le web.
   *
   * Il vivait dessous, sur deux lignes reservees, suivi d'une legende. Trois
   * choses ecrites sous une image qui porte deja le titre neuf fois sur dix, et
   * une carte dont la hauteur dependait de la longueur du titre — d'ou des
   * rangees en dents de scie. Sur le visuel, la carte fait exactement la
   * hauteur de son image.
   *
   * Pas de flou derriere le texte ici : React Native n'a pas d'equivalent au
   * `backdrop-filter` du web sans un module de plus. Le degrade devient franc
   * plus tot pour compenser.
   */
  const veil = (
    <LinearGradient
      colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.94)']}
      locations={[0, 0.42, 1]}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: tv(26),
        paddingHorizontal: tv(9),
        paddingBottom: tv(9),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <LanguageMark tag={tag} />
        <Text style={styles.cardOverTitle} numberOfLines={2}>
          {cleanTitle}
        </Text>
      </View>
      {subtitle ? (
        <Text style={styles.cardOverSub} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </LinearGradient>
  );

  return (
    // Sur TV, la carte doit **montrer** son focus : c'est la seule chose qui dit
    // ou l'on se trouve quand il n'y a ni curseur ni doigt.
    <Focusable
      onPress={onPress}
      style={[
        wide ? styles.cardWide : styles.card,
        stretch && { width: '100%', marginRight: 0 },
      ]}
    >
      <View style={[styles.cardMedia, wide && styles.cardMediaPlaque]}>
        {showImage ? (
          <Image
            source={{ uri: imageUrl! }}
            style={wide ? styles.posterWide : styles.poster}
            resizeMode={wide ? 'contain' : 'cover'}
            onError={() => setBroken(true)}
          />
        ) : (
          // Les initiales valent mieux qu'un rectangle vide, et restent lisibles.
          <View style={[wide ? styles.posterWide : styles.poster, styles.posterFallback]}>
            <Text style={styles.posterFallbackText}>{initials(cleanTitle)}</Text>
          </View>
        )}

        {veil}

        {/* La note en haut a gauche : centree, elle coupait en deux le titre
            imprime de la plupart des jaquettes. */}
        {rating != null && rating > 0 ? (
          <View style={styles.badgeRating}>
            <Text style={styles.badgeRatingText}>{rating.toFixed(1)}</Text>
          </View>
        ) : null}

        {/* L'age passe a droite : il partageait le coin gauche avec la note. */}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}

        {elapsedRatio != null && elapsedRatio > 0 && (
          <View
            style={[styles.progressTrack, { position: 'absolute', left: 0, right: 0, bottom: 0 }]}
          >
            {/* Programme en cours : c'est du direct, donc le rouge et non l'accent. */}
            <View
              style={[styles.elapsedFill, { width: `${Math.min(100, elapsedRatio * 100)}%` }]}
            />
          </View>
        )}

        {progressRatio != null && progressRatio > 0 && (
          <View
            style={[styles.progressTrack, { position: 'absolute', left: 0, right: 0, bottom: 0 }]}
          >
            <View
              style={[styles.progressFill, { width: `${Math.min(100, progressRatio * 100)}%` }]}
            />
          </View>
        )}
      </View>
    </Focusable>
  );
}


/** Part ecoulee du programme en cours, entre 0 et 1. */
export function elapsedOf(startAt: string, endAt: string): number | null {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!(end > start)) return null;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

/**
 * La carte d'une chaine : ce qui passe, et sur quelle chaine.
 *
 * Elle etait la meme carte qu'une oeuvre, avec un logo a la place d'une
 * affiche. Ce n'est pas la meme chose : une chaine n'annonce pas un titre,
 * elle annonce une emission. « beIN SPORTS 1 » ne dit pas quoi faire de sa
 * soiree ; « Basket-ball : Coupe du monde feminine », si.
 *
 * Meme decoupage que sur le web, aux moyens pres : le fond flou passe par
 * `blurRadius`, propriete du composant `Image` de React Native, et non par un
 * filtre CSS. Le numero et la qualite se rangent en colonne a gauche — a
 * droite se pose l'etoile, qui les recouvrirait.
 */
export function ChannelCard({
  channel,
  stretch,
  onPress,
}: {
  channel: LiveChannel;
  /** En grille, la carte prend la largeur de sa colonne. */
  stretch?: boolean;
  onPress: () => void;
}) {
  const { tag, title: raw } = splitLanguage(channel.name);
  const name = channelTitle(channel.name);
  // La qualite de la declinaison representante : deux TF1 ne se ressemblent
  // plus trait pour trait. Lue du nom, comme la base le fait.
  const quality = splitChannelQuality(raw).quality;
  const now = channel.now;
  const elapsed = now ? elapsedOf(now.startAt, now.endAt) : null;

  const [broken, setBroken] = useState(false);
  const showLogo = Boolean(channel.iconUrl) && !broken;

  return (
    <Focusable
      onPress={onPress}
      style={[styles.cardWide, stretch && { width: '100%', marginRight: 0 }]}
    >
      <View style={styles.chanMedia}>
        {showLogo ? (
          <>
            {/* Le fond, puis son voile : un logo clair pose sur son propre
                halo clair perdrait ses contours. */}
            <Image
              source={{ uri: channel.iconUrl! }}
              style={styles.chanBack}
              resizeMode="cover"
              blurRadius={18}
            />
            <View style={styles.chanScrim} />
            <Image
              source={{ uri: channel.iconUrl! }}
              style={styles.chanLogo}
              resizeMode="contain"
              onError={() => setBroken(true)}
            />
          </>
        ) : (
          <Text style={styles.posterFallbackText}>{initials(name)}</Text>
        )}

        <View style={styles.chanTags}>
          {/* Le numero : c'est par lui qu'on retrouve la chaine sur un
              televiseur — « fais 6 », pas « cherche M6 ». */}
          {channel.number != null && (
            <View style={styles.chanNum}>
              <Text style={styles.chanNumText}>{channel.number}</Text>
            </View>
          )}
          {quality ? (
            <View style={styles.chanQ}>
              <Text style={styles.chanQText}>{quality}</Text>
            </View>
          ) : null}
          {channel.isAdult ? (
            <View style={styles.chanQ}>
              <Text style={styles.chanQText}>18+</Text>
            </View>
          ) : null}
        </View>

        {/* Le nom, sur la plaque : trente-trois chaines d'une meme ligue
            partagent le meme logo. */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.72)']}
          style={styles.chanName}
          pointerEvents="none"
        >
          <LanguageMark tag={tag} />
          <Text style={styles.chanNameText} numberOfLines={2}>
            {name}
          </Text>
        </LinearGradient>

        {elapsed != null && elapsed > 0 && (
          <View style={[styles.progressTrack, { position: 'absolute', left: 0, right: 0, bottom: 0 }]}>
            <View style={[styles.elapsedFill, { width: `${Math.min(100, elapsed * 100)}%` }]} />
          </View>
        )}
      </View>

      {/* L'emission, et rien quand l'agenda se tait : la carte s'arrete alors
          a sa plaque. */}
      {now ? (
        <View style={styles.chanProg}>
          <Text style={styles.chanProgTitle} numberOfLines={2}>
            {now.title}
          </Text>
          <View style={styles.chanProgLine}>
            <View style={styles.chanDot} />
            <Text style={styles.chanProgText} numberOfLines={1}>
              {formatClock(now.startAt)}
              {now.description ? ` · ${now.description}` : ''}
            </Text>
          </View>
        </View>
      ) : null}
    </Focusable>
  );
}

export function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }}>
      {title ? <Text style={styles.h2}>{title}</Text> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 8 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}
