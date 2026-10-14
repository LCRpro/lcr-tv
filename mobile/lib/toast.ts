/**
 * Les toasts — des messages brefs, en surimpression, qui s'effacent seuls.
 *
 * On ne veut pas de la boîte d'alerte du navigateur ni d'un `Alert` natif pour
 * dire « enregistré » ou « échec » : un bandeau discret suffit. `toast()` est
 * une fonction simple, appelable de partout (hors React compris) ; le
 * `FeedbackProvider` enregistre ce qui l'affiche réellement.
 */
export type ToastKind = 'success' | 'error' | 'info';

type Handler = (message: string, kind: ToastKind) => void;

let handler: Handler | null = null;

export function setToastHandler(h: Handler | null): void {
  handler = h;
}

export function toast(message: string, kind: ToastKind = 'info'): void {
  handler?.(message, kind);
}

export const toastError = (message: string) => toast(message, 'error');
export const toastOk = (message: string) => toast(message, 'success');
