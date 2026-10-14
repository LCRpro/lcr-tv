import type { StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { confirmAction } from '../lib/confirm';
import {
  DOWNLOADS_OK,
  removeDownload,
  startDownload,
  useDownload,
  type DownloadKind,
} from '../lib/downloads';
import { Focusable } from './Focusable';

/**
 * Télécharger — ou retrouver ce qui l'est déjà.
 *
 * Trois états en un geste : non pris (flèche), en cours (le pourcentage), pris
 * (une coche verte, qu'on touche pour l'effacer de l'appareil). Sur le web, où
 * il n'y a pas de stockage, le bouton s'efface — le téléchargement est l'affaire
 * de l'app mobile.
 */
export function DownloadButton({
  kind,
  id,
  title,
  parentTitle,
  posterUrl,
  size = 22,
  style,
}: {
  kind: DownloadKind;
  id: number;
  title: string;
  parentTitle?: string | null;
  posterUrl?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const dl = useDownload(kind, id);
  if (!DOWNLOADS_OK) return null;

  const onPress = () => {
    if (!dl || dl.status === 'error') {
      void startDownload({ kind, id, title, parentTitle, posterUrl });
    } else if (dl.status === 'done') {
      confirmAction({
        title: 'Retirer le téléchargement ?',
        message: `« ${title} » sera effacé de l’appareil.`,
        confirmLabel: 'Retirer',
        onConfirm: () => void removeDownload(dl.key),
      });
    }
  };

  return (
    <Focusable onPress={onPress} style={style}>
      {dl?.status === 'downloading' ? (
        <Text style={{ color: colors.accent, fontSize: size * 0.52, fontWeight: '800' }}>
          {Math.round((dl.progress || 0) * 100)}%
        </Text>
      ) : (
        <Ionicons
          name={dl?.status === 'done' ? 'checkmark-circle' : 'download-outline'}
          size={size}
          color={dl?.status === 'done' ? colors.ok : colors.text}
        />
      )}
    </Focusable>
  );
}
