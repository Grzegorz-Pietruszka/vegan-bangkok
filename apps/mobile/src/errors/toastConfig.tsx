import { View, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Toast, { type ToastConfig, type ToastConfigParams } from 'react-native-toast-message';
import { ThemedText } from '@/components/ThemedText';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';

// House-styled toasts (the scan-screen warn-card look) instead of the library defaults.
// Icon + text carries severity — never color alone.

type ErrorProps = { retry?: () => void };

function AppErrorToast({ text1, props }: ToastConfigParams<ErrorProps>) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.error]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={18} color={colors.warnText} />
      <ThemedText variant="caption" color={colors.warnText} style={styles.msg}>{text1}</ThemedText>
      {props?.retry ? (
        <Pressable
          hitSlop={8}
          style={styles.retryPill}
          accessibilityRole="button"
          onPress={() => { Toast.hide(); props.retry?.(); }}
        >
          <ThemedText variant="label" color={colors.onPrimary}>{t('errors.retry')}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function AppSuccessToast({ text1 }: ToastConfigParams<unknown>) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.card, styles.success]} accessibilityLiveRegion="polite">
      <Ionicons name="checkmark-circle" size={18} color={colors.verifiedPillText} />
      <ThemedText variant="caption" color={colors.verifiedPillText} style={styles.msg}>{text1}</ThemedText>
    </View>
  );
}

export const toastConfig: ToastConfig = {
  appError: AppErrorToast,
  appSuccess: AppSuccessToast,
};

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radii.md, borderWidth: 1.5,
  },
  error: { backgroundColor: colors.warnBg, borderColor: colors.warnBorder },
  success: { backgroundColor: colors.verifiedPillBg, borderColor: colors.border },
  msg: { flex: 1, flexShrink: 1 },
  retryPill: {
    borderRadius: radii.pill, backgroundColor: colors.primary,
    paddingVertical: 6, paddingHorizontal: spacing.md,
  },
}));
