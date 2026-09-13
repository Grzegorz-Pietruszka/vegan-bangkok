import { View, Pressable, StyleSheet, Animated, useAnimatedValue } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { dishesSeed } from '@/data/dishes.seed';
import { placesSeed } from '@/data/places.seed';
import { coachLines } from '@/lib/coach';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopInsetScrim } from '@/components/Screen';

const HERO_H = 225;  // keep in sync with styles.hero.height — drives the scrim fade-in

export default function DishDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useStyles();
  const scrollY = useAnimatedValue(0);  // lint-clean form of useRef(new Animated.Value(0)).current
  const dish = dishesSeed.find((d) => d.id === id);

  if (!dish) {
    return (
      <View style={styles.center}><ThemedText>Dish not found.</ThemedText></View>
    );
  }
  const coach = coachLines(dish);
  const verifiedCount = dish.places.filter((p) => p.verifiedVegan).length;
  // interim: link place rows by name-matching the bundled places (see plan 05 data note)
  const placeIdByName = new Map(placesSeed.map((p) => [p.name, p.id]));

  // Scrim fades in as the hero scrolls up under the status bar, then holds.
  const scrimOpacity = scrollY.interpolate({
    inputRange: [HERO_H - insets.top - 40, HERO_H - insets.top],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        {/* photo placeholder — no photography in v1 assets */}
        <View style={styles.hero}>
          <Pressable onPress={() => router.back()} style={[styles.backCircle, { top: insets.top + spacing.sm }]} hitSlop={12}>
            <ThemedText variant="title">‹</ThemedText>
          </Pressable>
          <ThemedText variant="caption" color={colors.white}>photo · {dish.nameEn.toLowerCase()}</ThemedText>
        </View>

        <View style={styles.titleRow}>
          <ThemedText variant="h1" style={styles.titleText}>{dish.nameEn}</ThemedText>
          {dish.regionName ? (
            <View style={styles.regionChip}>
              <ThemedText variant="caption" color={colors.neutralPillText}>{dish.regionName}</ThemedText>
            </View>
          ) : null}
        </View>
        {dish.nameTh ? (
          <ThemedText variant="title" script="thai" color={colors.textMuted}>
            {dish.nameTh}{coach.say ? ` · ${coach.say.roman}` : ''}
          </ThemedText>
        ) : null}
        {dish.description ? <ThemedText color={colors.textSoft}>{dish.description}</ThemedText> : null}

        <View style={styles.coachCard}>
          <ThemedText variant="label" color={colors.primary} style={styles.coachLabel}>
            HOW TO ORDER IT VEGAN
          </ThemedText>
          {coach.say ? (
            <ThemedText color={colors.coachText}>✓  say “{coach.say.roman}”</ThemedText>
          ) : null}
          {coach.avoid.map((line) => (
            <ThemedText key={line.english} color={colors.coachText}>
              ✕  {line.thai ? `${line.thai} — ` : ''}{line.english}
            </ThemedText>
          ))}
        </View>

        <View style={styles.confidenceStrip}>
          <ThemedText variant="label" color={verifiedCount ? colors.primary : colors.communityPillText}>
            {verifiedCount
              ? `Verified — served vegan at ${verifiedCount} team-checked ${verifiedCount === 1 ? 'place' : 'places'}`
              : 'High confidence when coached — use the phrases above'}
          </ThemedText>
        </View>

        <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
          WHERE TO EAT IT
        </ThemedText>
        {dish.places.length === 0 ? (
          <ThemedText variant="caption" color={colors.textMuted}>
            No listed places yet — any Thai kitchen can make it with the coach above.
          </ThemedText>
        ) : (
          dish.places.map((p) => {
            const placeId = placeIdByName.get(p.name);
            const row = (
              <View style={styles.placeRow} key={p.name}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="title">{p.name}</ThemedText>
                  {p.lovedCount ? (
                    <ThemedText variant="caption" color={colors.communityPillText}>★ loved by {p.lovedCount} users</ThemedText>
                  ) : null}
                </View>
                {p.verifiedVegan ? (
                  <View style={styles.verifiedPill}>
                    <ThemedText variant="caption" color={colors.verifiedPillText}>Verified</ThemedText>
                  </View>
                ) : null}
              </View>
            );
            return placeId ? (
              <Pressable key={p.name} onPress={() => router.push(`/place/${placeId}`)}>{row}</Pressable>
            ) : row;
          })
        )}
        <View style={{ height: 96 }} />
      </Animated.ScrollView>

      <Animated.View pointerEvents="none" style={[styles.topScrim, { opacity: scrimOpacity }]}>
        <TopInsetScrim top={insets.top} />
      </Animated.View>

      <View style={[styles.ctaRow, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable style={styles.secondaryPill} onPress={() => router.push(`/vendor/${dish.id}`)}>
          <ThemedText variant="label" color={colors.primary}>Show the vendor</ThemedText>
        </Pressable>
        <Pressable style={styles.primaryPill} onPress={() => { /* place list arrives with 5b/search */ }}>
          <ThemedText variant="label" color={colors.onPrimary}>
            {dish.places.length} {dish.places.length === 1 ? 'place' : 'places'}
          </ThemedText>
        </Pressable>
      </View>
    </>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  hero: {
    height: 225, backgroundColor: '#206543', alignItems: 'center', justifyContent: 'center',
  },
  backCircle: {
    position: 'absolute', left: spacing.xl, width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.bg + 'D9', alignItems: 'center', justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg,
  },
  titleText: { flexShrink: 1 },
  regionChip: {
    backgroundColor: colors.neutralPillBg, borderRadius: radii.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  coachCard: {
    marginHorizontal: spacing.xl, backgroundColor: colors.coachBg, borderColor: colors.coachBorder,
    borderWidth: 1.5, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm,
  },
  coachLabel: { letterSpacing: 1 },
  confidenceStrip: {
    marginHorizontal: spacing.xl, backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1.5, borderRadius: radii.md, padding: spacing.lg,
  },
  sectionLabel: { paddingHorizontal: spacing.xl, letterSpacing: 1, marginTop: spacing.sm },
  placeRow: {
    marginHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5,
    borderRadius: radii.md, padding: spacing.lg,
  },
  verifiedPill: {
    backgroundColor: colors.verifiedPillBg, borderRadius: radii.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  ctaRow: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.md,
    padding: spacing.xl, backgroundColor: colors.bg,
  },
  secondaryPill: {
    flex: 1, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.coachBorder,
    backgroundColor: colors.surface, alignItems: 'center', paddingVertical: 15,
  },
  primaryPill: {
    flex: 1, borderRadius: radii.pill, backgroundColor: colors.primary,
    alignItems: 'center', paddingVertical: 15,
  },
}));
