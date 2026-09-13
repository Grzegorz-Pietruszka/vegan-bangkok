import { useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react-native';
import { ThemedText } from '@/components/ThemedText';
import { Screen } from '@/components/Screen';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';

// Full-screen state for unrecoverable render errors — wired up as the expo-router
// ErrorBoundary export in app/_layout.tsx. Shows a safe generic message + retry;
// the real error goes to Sentry, never on screen.
export function ErrorScreen({ error, retry }: { error: Error; retry: () => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.center}>
        <ThemedText variant="h1">{t('errors.title')}</ThemedText>
        <ThemedText variant="caption" color={colors.textMuted} style={styles.msg}>
          {t('errors.unknown')}
        </ThemedText>
        <Pressable style={styles.retryBtn} onPress={retry} accessibilityRole="button">
          <ThemedText variant="label" color={colors.onPrimary}>{t('errors.retry')}</ThemedText>
        </Pressable>
      </View>
    </Screen>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  msg: { textAlign: 'center' },
  retryBtn: {
    borderRadius: radii.pill, backgroundColor: colors.primary,
    paddingVertical: 12, paddingHorizontal: spacing.xxl, marginTop: spacing.sm,
  },
}));
