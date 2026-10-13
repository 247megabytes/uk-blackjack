import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import type { HapticHint } from '../game';

/** Fire-and-forget haptic feedback; silently ignored where unsupported (web, some Android devices). */
export function haptic(hint: HapticHint, enabled: boolean): void {
  if (!enabled || hint === 'none' || Platform.OS === 'web') return;
  let p: Promise<void>;
  switch (hint) {
    case 'light':
      p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'medium':
      p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'heavy':
      p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 'success':
      p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'warning':
      p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      break;
    case 'error':
      p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
  }
  p.catch(() => undefined);
}

export function tapHaptic(enabled: boolean): void {
  if (!enabled || Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => undefined);
}
