import { useSyncExternalStore } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { onlineManager } from '@tanstack/react-query';
import { ThemedText } from '@/components/ThemedText';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';

// Persistent pill while the device is offline — the ONE place ongoing offline state is
// shown, so presentError never toasts 'offline' while this is up. Rides the existing
// onlineManager ↔ expo-network wiring in queryClient.ts; no second network listener.
export function OfflineBanner() {
  const online = useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  if (online) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.pill, { top: insets.top + spacing.sm }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={14} color={colors.bg} />
      <ThemedText variant="caption" color={colors.bg}>{t('errors.offlineBanner')}</ThemedText>
    </View>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  pill: {
    position: 'absolute', alignSelf: 'center', zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.text, borderRadius: radii.pill,
    paddingVertical: 6, paddingHorizontal: spacing.lg,
  },
}));
