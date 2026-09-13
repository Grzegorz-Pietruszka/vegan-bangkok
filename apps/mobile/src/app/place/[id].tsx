import { View, ScrollView, Pressable, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { placesSeed } from '@/data/places.seed';
import { dishesSeed } from '@/data/dishes.seed';
import { isOpenNow } from '@/lib/openNow';
import { useSavedPlaces, isSaved, loadSaved } from '@/saved/savedPlaces';
import { maybeAskPermission, syncLunchNudge } from '@/notifications/lunchNudge';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_LABEL: Record<string, string> = {
  fully_vegan: '100% vegan',
  vegetarian_jay: 'Vegetarian (jay)',
  vegan_friendly: 'Vegan-friendly',
};

export default function PlaceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const place = placesSeed.find((p) => p.id === id);
  const insets = useSafeAreaInsets();
  const { saved, toggle } = useSavedPlaces();
  const savedNow = isSaved(saved, id ?? '');

  if (!place) {
    return <View style={styles.center}><ThemedText>Place not found.</ThemedText></View>;
  }

  const dishesHere = dishesSeed.filter((d) => d.places.some((p) => p.name === place.name));
  const lovedCount = Math.max(0, ...dishesHere.flatMap((d) =>
    d.places.filter((p) => p.name === place.name).map((p) => p.lovedCount)));
  const open = isOpenNow(place.hours);

  const openDirections = () =>
    Linking.openURL(`http://maps.apple.com/?daddr=${place.lat},${place.lng}`).catch(() => {});

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}>
        <View style={styles.hero}>
          <Pressable onPress={() => router.back()} style={[styles.backCircle, { top: insets.top + spacing.sm }]} hitSlop={12}>
            <ThemedText variant="title">‹</ThemedText>
          </Pressable>
          <ThemedText variant="caption" color={colors.white}>photo · {place.name.toLowerCase()}</ThemedText>
        </View>

        <View style={styles.body}>
          <ThemedText variant="h1">{place.name}</ThemedText>

          <View style={styles.badgeRow}>
            {place.verified ? (
              <View style={styles.verifiedPill}>
                <ThemedText variant="caption" color={colors.verifiedPillText}>Verified Vegan · by our team</ThemedText>
              </View>
            ) : null}
            {lovedCount > 0 ? (
              <View style={styles.communityPill}>
                <ThemedText variant="caption" color={colors.communityPillText}>★ loved by {lovedCount} users</ThemedText>
              </View>
            ) : null}
          </View>

          <ThemedText variant="caption" color={colors.textMuted}>
            {STATUS_LABEL[place.veganStatus] ?? place.veganStatus} · {'฿'.repeat(place.priceBand)} · {place.neighbourhood}
            {place.nearestStation ? ` · ${place.nearestStation}` : ''}
          </ThemedText>
          <ThemedText variant="caption" color={open ? colors.okText : colors.textMuted}>
            {open ? 'Open now' : 'Closed now'}
          </ThemedText>

          {place.summary ? (
            <ThemedText color={colors.textSoft} style={styles.summary}>{place.summary}</ThemedText>
          ) : null}
          {place.vibeTags && place.vibeTags.length > 0 ? (
            <View style={styles.vibeRow}>
              {place.vibeTags.map((t) => (
                <View key={t} style={styles.vibeChip}>
                  <ThemedText variant="caption" color={colors.neutralPillText}>{t.replace(/-/g, ' ')}</ThemedText>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable style={styles.primaryPill} onPress={openDirections}>
              <ThemedText variant="label" color={colors.onPrimary}>Directions</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.secondaryPill, { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => {
                void (async () => {
                  await toggle(id ?? '');
                  // Post-toggle storage truth, not the render-time closure — a rapid
                  // double-tap otherwise fires the pre-prompt on what is now an unsave.
                  const list = await loadSaved();
                  if (isSaved(list, id ?? '')) await maybeAskPermission(); // saved → contextual pre-prompt (self-gated to once)
                  await syncLunchNudge(list);                              // idempotent; pass the list we already loaded
                })().catch(() => {});
              }}
            >
              <Ionicons name={savedNow ? 'bookmark' : 'bookmark-outline'} size={16} color={colors.primary} />
              <ThemedText variant="label" color={colors.primary}>{savedNow ? 'Saved' : 'Save'}</ThemedText>
            </Pressable>
          </View>

          <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
            VEGAN DISHES HERE
          </ThemedText>
          {dishesHere.length === 0 ? (
            <ThemedText variant="caption" color={colors.textMuted}>
              No linked dishes yet — check the Explore tab for coached dishes.
            </ThemedText>
          ) : (
            dishesHere.map((d) => (
              <Pressable key={d.id} style={styles.dishRow} onPress={() => router.push(`/dish/${d.id}`)}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="title">{d.nameEn}</ThemedText>
                  {d.places.find((p) => p.name === place.name)?.verifiedVegan ? (
                    <ThemedText variant="caption" color={colors.okText}>vegan · team verified</ThemedText>
                  ) : (
                    <ThemedText variant="caption" color={colors.textMuted}>vegan when coached</ThemedText>
                  )}
                </View>
                <ThemedText variant="title" color={colors.textMuted}>›</ThemedText>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  hero: { height: 230, backgroundColor: '#25714B', alignItems: 'center', justifyContent: 'center' },
  backCircle: {
    position: 'absolute', left: spacing.xl, width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.bg + 'D9', alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: spacing.xl, gap: spacing.md },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  verifiedPill: {
    backgroundColor: colors.verifiedPillBg, borderRadius: radii.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  communityPill: {
    backgroundColor: colors.communityPillBg, borderRadius: radii.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  summary: { marginTop: spacing.xs, lineHeight: 21 },
  vibeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  vibeChip: {
    backgroundColor: colors.neutralPillBg, borderRadius: radii.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  primaryPill: {
    flex: 1, borderRadius: radii.pill, backgroundColor: colors.primary,
    alignItems: 'center', paddingVertical: 14,
  },
  secondaryPill: {
    flex: 1, borderRadius: radii.pill, backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.coachBorder, alignItems: 'center', paddingVertical: 14,
  },
  sectionLabel: { letterSpacing: 1, marginTop: spacing.md },
  dishRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5,
    borderRadius: radii.md, padding: spacing.lg,
  },
}));
