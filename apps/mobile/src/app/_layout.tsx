import '@/i18n';                       // MUST be first — inits i18n before any screen renders
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import Toast from 'react-native-toast-message';
import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, asyncStoragePersister, PERSIST_MAX_AGE } from '@/query/queryClient';
import { useAppFocusRefetch } from '@/query/useAppFocusRefetch';
import { initNotifications, useNotificationTapObserver } from '@/notifications/setup';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { toastConfig } from '@/errors/toastConfig';
import { useColors } from '@/theme/useTheme';
import { applyStoredAppearance } from '@/theme/appearance';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorScreen } from '@/components/ErrorScreen';

Sentry.init({
  dsn: Constants.expoConfig?.extra?.sentryDsn as string | undefined,
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  integrations: [Sentry.expoRouterIntegration({ enableTimeToInitialDisplay: !isRunningInExpoGo() })],
});
initNotifications();   // handler + Android channel — before any screen can schedule
applyStoredAppearance();   // re-apply manual light/dark override before screens settle

export default Sentry.wrap(function RootLayout() {
  useAppFocusRefetch();
  useNotificationTapObserver();
  const colors = useColors();   // themed nav background — no white flash between screens in dark mode
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <PersistQueryClientProvider client={queryClient}
        persistOptions={{ persister: asyncStoragePersister, maxAge: PERSIST_MAX_AGE }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="+not-found" />
        </Stack>
        <OfflineBanner />
      </PersistQueryClientProvider>
      {/* Toast host — mounted ONCE, last child so it renders above every screen. */}
      <Toast config={toastConfig} position="bottom" bottomOffset={96} />
    </SafeAreaProvider>
  );
});

// expo-router error boundary: any screen that throws during render lands here instead
// of a white screen — safe generic message + retry, original error to Sentry.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorScreen error={error} retry={retry} />;
}
// GestureHandlerRootView wrap OUTSIDE PersistQueryClientProvider when added.
// Auth gate (Stack.Protected + sign-in route + splash-on-token) is added in file 02.
