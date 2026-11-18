import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function tapLight() {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function tapMedium() {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function tapSuccess() {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
