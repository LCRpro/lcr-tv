import { Alert, Platform } from 'react-native';

/**
 * Une confirmation qui marche partout.
 *
 * `Alert.alert` de React Native ne fait rien sur le web : la boîte ne s'ouvre
 * pas, et l'action confirmée n'est jamais lancée — c'est ce qui cassait la
 * déconnexion. On retombe donc sur `window.confirm` au navigateur, et on garde
 * l'alerte native sur l'appareil.
 */
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  const { title, message, confirmLabel = 'Confirmer', destructive = true, onConfirm } = opts;

  if (Platform.OS === 'web') {
    try {
      if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    } catch {
      // Pas de fenêtre (rendu hors navigateur) : on agit sans confirmation.
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Annuler', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
