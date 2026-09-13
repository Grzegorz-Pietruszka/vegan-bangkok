import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  useColorScheme,
  View,
  Pressable,
  StyleSheet,
  useAnimatedValue,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/ThemedText';
import { dishesSeed, type BundledDish } from '@/data/dishes.seed';
import { coachLines, type Coach } from '@/lib/coach';
import { isVendorCardTap, shouldDismissVendorCard } from '@/lib/vendorCardGesture';
import { addStamp } from '@/passport/stamps';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type VendorCardContentProps = {
  dish: BundledDish;
  coach: Coach;
  thaiLine: string | null;
  // Full-screen "show to the vendor" mode — bump text so it reads at arm's length.
  large?: boolean;
};

function VendorCardContent({ dish, coach, thaiLine, large = false }: VendorCardContentProps) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <>
      <ThemedText variant="label" color={colors.onBrandDim} style={[styles.trackingLabel, large && styles.trackingLabelLg]}>
        {dish.nameEn.toUpperCase()} · VEGAN
      </ThemedText>
      {thaiLine ? (
        <ThemedText variant="vendorNameThai" script="thai" color={colors.white} style={[styles.thai, large && styles.thaiLg]}>
          {thaiLine}
        </ThemedText>
      ) : (
        <ThemedText variant="h1" color={colors.white} style={large && styles.heroEnLg}>{dish.nameEn} (vegan)</ThemedText>
      )}
      <View style={styles.exclusions}>
        {coach.avoid.map((line) => (
          <View key={line.english} style={styles.exclusionRow}>
            {line.thai ? (
              <ThemedText variant="title" script="thai" color={colors.white} style={large && styles.exclusionThaiLg}>✕ {line.thai}</ThemedText>
            ) : null}
            <ThemedText variant="caption" color={colors.onBrandDim} style={large && styles.exclusionEnLg}>{line.english}</ThemedText>
          </View>
        ))}
      </View>
      {coach.say ? (
        <View style={[styles.sayPill, large && styles.sayPillLg]}>
          <ThemedText variant="label" color={colors.white} style={large && styles.sayLg}>“{coach.say.roman}”</ThemedText>
        </View>
      ) : null}
    </>
  );
}

export default function VendorCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = useColors();
  const styles = useStyles();
  const dish = dishesSeed.find((d) => d.id === id);
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const animationLocked = useRef(false);
  const overlayOpacity = useAnimatedValue(0);
  const overlayScale = useAnimatedValue(0.96);
  const overlayTranslateY = useAnimatedValue(0);

  const resetOverlay = useCallback(() => {
    overlayOpacity.setValue(0);
    overlayScale.setValue(0.96);
    overlayTranslateY.setValue(0);
  }, [overlayOpacity, overlayScale, overlayTranslateY]);

  const openOverlay = useCallback(() => {
    if (animationLocked.current || expanded) return;
    animationLocked.current = true;
    resetOverlay();
    setExpanded(true);
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(overlayScale, {
        toValue: 1,
        speed: 24,
        bounciness: 2,
        useNativeDriver: true,
      }),
    ]).start(() => {
      animationLocked.current = false;
    });
  }, [expanded, overlayOpacity, overlayScale, resetOverlay]);

  const dismissOverlay = useCallback((swipeDistance?: number) => {
    if (animationLocked.current || !expanded) return;
    animationLocked.current = true;
    const closingAnimations = swipeDistance === undefined
      ? [
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(overlayScale, {
            toValue: 0.96,
            duration: 150,
            useNativeDriver: true,
          }),
        ]
      : [
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(overlayTranslateY, {
            toValue: Math.max(swipeDistance, 0) + 480,
            duration: 180,
            useNativeDriver: true,
          }),
        ];

    Animated.parallel(closingAnimations).start(() => {
      setExpanded(false);
      resetOverlay();
      animationLocked.current = false;
    });
  }, [expanded, overlayOpacity, overlayScale, overlayTranslateY, resetOverlay]);

  const handlePanMove = useCallback((
    _event: GestureResponderEvent,
    gestureState: PanResponderGestureState,
  ) => {
    if (!animationLocked.current) {
      overlayTranslateY.setValue(Math.max(0, gestureState.dy));
    }
  }, [overlayTranslateY]);

  const handlePanRelease = useCallback((
    _event: GestureResponderEvent,
    gestureState: PanResponderGestureState,
  ) => {
    if (animationLocked.current) return;
    if (isVendorCardTap(gestureState.dx, gestureState.dy)) {
      dismissOverlay();
    } else if (shouldDismissVendorCard(gestureState.dy, gestureState.vy)) {
      dismissOverlay(gestureState.dy);
    } else {
      Animated.spring(overlayTranslateY, {
        toValue: 0,
        speed: 24,
        bounciness: 4,
        useNativeDriver: true,
      }).start();
    }
  }, [dismissOverlay, overlayTranslateY]);

  const handlePanTerminate = useCallback(() => {
    overlayTranslateY.setValue(0);
  }, [overlayTranslateY]);

  // PanResponder.create stores these callbacks for later native events; it does not invoke them here.
  // eslint-disable-next-line react-hooks/refs
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: handlePanMove,
    onPanResponderRelease: handlePanRelease,
    onPanResponderTerminate: handlePanTerminate,
  }), [handlePanMove, handlePanRelease, handlePanTerminate]);

  // Max brightness while the card is up; restore the user's level on blur.
  // App-scoped only (setBrightnessAsync) — never the system setting. Decisions-log behavior.
  const saved = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Brightness.getBrightnessAsync()
        .then((b) => { if (active) { saved.current = b; return Brightness.setBrightnessAsync(1); } })
        .catch(() => {});
      return () => {
        active = false;
        if (saved.current != null) Brightness.setBrightnessAsync(saved.current).catch(() => {});
      };
    }, []),
  );

  if (!dish) {
    return <View style={styles.center}><ThemedText>Dish not found.</ThemedText></View>;
  }
  const coach = coachLines(dish);
  // เจ marks the order as vegan — the core phrase pattern ("<dish> jay").
  const thaiLine = dish.nameTh ? `${dish.nameTh}เจ` : null;
  const orderingAccessibilityText = [
    `${dish.nameEn}, vegan`,
    thaiLine,
    ...coach.avoid.map((line) => [line.thai, line.english].filter(Boolean).join(', ')),
    coach.say ? `Say ${coach.say.roman}` : null,
  ].filter((line): line is string => Boolean(line)).join('. ');

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style={expanded || scheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.root}>
        <View
          style={[styles.screen, { paddingTop: insets.top + spacing.md }]}
          accessibilityElementsHidden={expanded}
          importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
        >
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backCircle} hitSlop={12}>
              <ThemedText variant="title">‹</ThemedText>
            </Pressable>
            <ThemedText variant="label" color={colors.textMuted} style={styles.headerLabel}>
              SHOW THIS TO THE VENDOR
            </ThemedText>
            <ThemedText variant="title">☀︎</ThemedText>
          </View>

          <Pressable
            testID="vendor-card"
            style={styles.card}
            onPress={openOverlay}
            accessibilityRole="button"
            accessibilityLabel={`Expand vendor card for ${dish.nameEn}. ${orderingAccessibilityText}`}
            accessibilityHint="Shows this ordering card full screen for the vendor"
          >
            <VendorCardContent dish={dish} coach={coach} thaiLine={thaiLine} />
          </Pressable>

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <ThemedText variant="caption" color={colors.textMuted} style={{ textAlign: 'center' }}>
              Vendors see this every day — just show the card.
            </ThemedText>
            <View style={styles.footerPills}>
              <View style={[styles.footerPill, styles.footerPillDisabled]}>
                <ThemedText variant="label" color={colors.textMuted}>More phrases</ThemedText>
              </View>
              <Pressable
                style={[styles.footerPill, styles.footerPillPrimary]}
                onPress={() => {
                  // Ordering IS the passport moment (decisions log: automatic, nothing manual).
                  addStamp(dish.id).catch(() => {});
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  router.back();
                }}
              >
                <ThemedText variant="label" color={colors.onPrimary}>Got it, ordered</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>

        {expanded ? (
          <Animated.View
            testID="vendor-card-fullscreen"
            style={[
              styles.fullscreen,
              {
                opacity: overlayOpacity,
                transform: [{ translateY: overlayTranslateY }],
              },
            ]}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss vendor card for ${dish.nameEn}. ${orderingAccessibilityText}`}
            accessibilityHint="Tap anywhere or swipe down to dismiss"
            accessibilityActions={[{ name: 'activate', label: 'Dismiss vendor card' }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'activate') dismissOverlay();
            }}
            onAccessibilityTap={() => dismissOverlay()}
            {...panResponder.panHandlers}
          >
            <Animated.View
              style={[
                styles.fullscreenContent,
                {
                  paddingTop: insets.top + spacing.xxl,
                  paddingRight: insets.right + spacing.xxl,
                  paddingBottom: insets.bottom + spacing.xxl,
                  paddingLeft: insets.left + spacing.xxl,
                  transform: [{ scale: overlayScale }],
                },
              ]}
            >
              <VendorCardContent dish={dish} coach={coach} thaiLine={thaiLine} large />
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>
    </>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { letterSpacing: 1 },
  backCircle: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  card: {
    flex: 1, marginVertical: spacing.xl, backgroundColor: colors.brandGreen, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg,
  },
  trackingLabel: { letterSpacing: 2 },
  thai: { textAlign: 'center' },
  // Full-screen size bumps — vendor-readable at arm's length.
  trackingLabelLg: { fontSize: 18, lineHeight: 22 },
  thaiLg: { fontSize: 64, lineHeight: 72 },
  heroEnLg: { fontSize: 40, lineHeight: 46, textAlign: 'center' },
  exclusionThaiLg: { fontSize: 34, lineHeight: 42 },
  exclusionEnLg: { fontSize: 18, lineHeight: 24 },
  sayPillLg: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg },
  sayLg: { fontSize: 24, lineHeight: 30 },
  exclusions: { gap: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  exclusionRow: { alignItems: 'center', gap: 2 },
  sayPill: {
    marginTop: spacing.lg, backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radii.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  fullscreen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    backgroundColor: colors.brandGreen,
  },
  fullscreenContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  footer: { gap: spacing.md },
  footerPills: { flexDirection: 'row', gap: spacing.md },
  footerPill: { flex: 1, borderRadius: radii.pill, alignItems: 'center', paddingVertical: 14 },
  footerPillDisabled: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  footerPillPrimary: { backgroundColor: colors.primary },
}));
