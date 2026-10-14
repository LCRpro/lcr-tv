import { Alert, Platform } from 'react-native';

/**
 * Une confirmation qui marche partout — et dans l'habillage de l'app.
 *
 * Tant qu'un `FeedbackProvider` est monté, c'est lui qui affiche la boîte, aux
 * couleurs de LCR TV plutôt que celle, grise, du navigateur ou du système. En
 * repli (aucun provider), on retombe sur `window.confirm` au web et `Alert` sur
 * l'appareil, pour qu'une confirmation ne soit jamais perdue.
 */
export type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

let handler: ((opts: ConfirmOpts) => void) | null = null;

export function setConfirmHandler(h: ((opts: ConfirmOpts) => void) | null): void {
  handler = h;
}

export function confirmAction(opts: ConfirmOpts): void {
  if (handler) {
    handler(opts);
    return;
  }

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
