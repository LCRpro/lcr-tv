import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../lib/theme';
import { setToastHandler, type ToastKind } from '../lib/toast';
import { setConfirmHandler, type ConfirmOpts } from '../lib/confirm';
import { Focusable } from './Focusable';

/**
 * Le fournisseur des retours d'interface : toasts et confirmations.
 *
 * Il s'enregistre comme destinataire de `toast()` et `confirmAction()`, de
 * sorte que n'importe quel appel — même hors d'un composant — remonte ici et
 * s'affiche aux couleurs de l'app, au lieu des boîtes grises du navigateur ou
 * du système. Monté une seule fois, autour de toute l'application.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: ToastKind }>>([]);
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);

  useEffect(() => {
    setToastHandler((message, kind) => {
      const id = Date.now() + Math.random();
      // Au plus trois à la fois : au-delà, c'est du bruit, pas de l'information.
      setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
    });
    setConfirmHandler((opts) => setConfirm(opts));
    return () => {
      setToastHandler(null);
      setConfirmHandler(null);
    };
  }, []);

  return (
    <>
      {children}

      {toasts.length ? (
        <View style={[fb.toastWrap, { top: insets.top + 10 }]} pointerEvents="box-none">
          {toasts.map((t) => (
            <ToastRow key={t.id} message={t.message} kind={t.kind} />
          ))}
        </View>
      ) : null}

      {confirm ? <ConfirmDialog opts={confirm} onClose={() => setConfirm(null)} /> : null}
    </>
  );
}

const TOAST_LOOK: Record<ToastKind, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: 'checkmark-circle', color: colors.ok },
  error: { icon: 'alert-circle', color: colors.live },
  info: { icon: 'information-circle', color: colors.accent },
};

function ToastRow({ message, kind }: { message: string; kind: ToastKind }) {
  const look = TOAST_LOOK[kind];
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
  }, [enter]);
  return (
    <Animated.View
      style={[
        fb.toast,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
          ],
        },
      ]}
    >
      <Ionicons name={look.icon} size={20} color={look.color} />
      <Text style={fb.toastText} numberOfLines={3}>
        {message}
      </Text>
    </Animated.View>
  );
}

function ConfirmDialog({ opts, onClose }: { opts: ConfirmOpts; onClose: () => void }) {
  const { title, message, confirmLabel = 'Confirmer', destructive = true, onConfirm } = opts;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={fb.dialogRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={fb.dialog}>
          <Text style={fb.dialogTitle}>{title}</Text>
          {message ? <Text style={fb.dialogMessage}>{message}</Text> : null}
          <View style={fb.dialogActions}>
            <Focusable
              onPress={onClose}
              style={({ pressed }) => [fb.dialogBtn, fb.dialogCancel, pressed && { opacity: 0.7 }]}
            >
              <Text style={fb.dialogCancelText}>Annuler</Text>
            </Focusable>
            <Focusable
              onPress={() => {
                onClose();
                onConfirm();
              }}
              style={({ pressed }) => [
                fb.dialogBtn,
                destructive ? fb.dialogDanger : fb.dialogConfirm,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={destructive ? fb.dialogDangerText : fb.dialogConfirmText}>
                {confirmLabel}
              </Text>
            </Focusable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const fb = StyleSheet.create({
  toastWrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', gap: 8, zIndex: 50 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  toastText: { flex: 1, color: colors.text, fontFamily: 'Inter', fontSize: 14, lineHeight: 19 },

  dialogRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  dialogTitle: {
    color: colors.text,
    fontFamily: 'Outfit',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  dialogMessage: { color: colors.dim, fontFamily: 'Inter', fontSize: 14, lineHeight: 20, marginTop: 8 },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  dialogBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
  dialogCancel: { backgroundColor: colors.bgSoft, borderWidth: 1, borderColor: colors.border },
  dialogCancelText: { color: colors.text, fontFamily: 'Outfit', fontSize: 15, fontWeight: '600' },
  dialogConfirm: { backgroundColor: colors.accent },
  dialogConfirmText: { color: colors.onAccent, fontFamily: 'Outfit', fontSize: 15, fontWeight: '700' },
  dialogDanger: { backgroundColor: colors.live },
  dialogDangerText: { color: '#fff', fontFamily: 'Outfit', fontSize: 15, fontWeight: '700' },
});
