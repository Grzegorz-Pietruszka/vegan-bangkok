import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { dishesSeed } from '@/data/dishes.seed';
import { pickTonightsDish } from '@/lib/homePick';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { Screen } from '@/components/Screen';

const REGION_TILES = [
  { region: 'Isaan (northeast)', label: 'Isaan', bg: 'verifiedPillBg', text: 'verifiedPillText' },
  { region: 'Northern Thailand', label: 'Northern', bg: 'communityPillBg', text: 'communityPillText' },
  { region: 'Central Thailand', label: 'Central', bg: 'neutralPillBg', text: 'neutralPillText' },
] as const;

const DAYPART = (h: number) => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening');

// 5a Home — greeting, Tonight's Pick hero, order shelf, region tiles.
export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const now = new Date();
  const context = `${now.toLocaleDateString('en-GB', { weekday: 'long' })} ${DAYPART(now.getHours())} · Bangkok`;

  const pick = useMemo(() => pickTonightsDish(dishesSeed, now), []); // stable per mount
  const shelf = useMemo(() => dishesSeed.filter((d) => d.orderPhrase).slice(0, 8), []);
  const pickPlace = pick?.places.find((p) => p.verifiedVegan);

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.greetingRow}>
        <View style={{ flex: 1 }}>
          <ThemedText variant="caption" color={colors.textMuted}>{context}</ThemedText>
          <ThemedText variant="h1">{t('explore.title')}</ThemedText>
        </View>
        <View style={styles.avatar}><ThemedText variant="title" color={colors.onPrimary}>🥬</ThemedText></View>
      </View>

      <Pressable style={styles.searchPill} onPress={() => router.push('/discover')}>
        <ThemedText color={colors.textMuted}>⌕  {t('home.searchPlaceholder')}</ThemedText>
      </Pressable>

      <Pressable style={styles.cravingCard} onPress={() => router.push('/chat')}>
        <ThemedText variant="title" color={colors.onBrand}>What are you craving?</ThemedText>
        <ThemedText variant="caption" color={colors.onBrandDim}>Ask in your own words — “rainy day soup near me”</ThemedText>
      </Pressable>

      {pick ? (
        <Pressable style={styles.hero} onPress={() => router.push(`/dish/${pick.id}`)}>
          <View style={styles.heroPhoto}>
            <ThemedText variant="caption" color={colors.white}>photo · {pick.nameEn.toLowerCase()}</ThemedText>
          </View>
          <View style={styles.heroBody}>
            <View style={styles.heroPill}>
              <ThemedText variant="caption" color="#3A2E00">{t('home.tonightsPick')}</ThemedText>
            </View>
            <ThemedText variant="title" color={colors.white}>{pick.nameEn}</ThemedText>
            {pick.description ? (
              <ThemedText variant="caption" color={colors.onBrandDim} numberOfLines={1}>{pick.description}</ThemedText>
            ) : null}
            {pickPlace ? (
              <ThemedText variant="caption" color={colors.onBrandDim}>
                ✓ {t('home.verifiedAt')} {pickPlace.name}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
        {t('home.orderShelf')}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
        {shelf.map((d) => (
          <Pressable key={d.id} style={styles.shelfCard} onPress={() => router.push(`/dish/${d.id}`)}>
            <View style={styles.shelfPhoto}>
              <ThemedText variant="caption" color={colors.white} numberOfLines={1}>photo</ThemedText>
            </View>
            <ThemedText variant="label" numberOfLines={1}>{d.nameEn}</ThemedText>
            <ThemedText variant="caption" color={colors.okText} numberOfLines={1}>say “{d.orderPhrase}”</ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
        {t('home.eatByRegion')}
      </ThemedText>
      <View style={styles.regionRow}>
        {REGION_TILES.map((tile) => {
          const two = dishesSeed.filter((d) => d.regionName === tile.region).slice(0, 2);
          return (
            <Pressable
              key={tile.region}
              style={[styles.regionTile, { backgroundColor: colors[tile.bg] }]}
              onPress={() => router.push({ pathname: '/discover', params: { region: tile.region } })}
            >
              <ThemedText variant="label" color={colors[tile.text]}>{tile.label}</ThemedText>
              {two.map((d) => (
                <ThemedText key={d.id} variant="caption" color={colors[tile.text]} numberOfLines={1}>{d.nameEn}</ThemedText>
              ))}
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  searchPill: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: 13,
  },
  cravingCard: { backgroundColor: colors.brandGreen, borderRadius: radii.lg, padding: spacing.lg,
    marginBottom: spacing.lg, gap: 2 },
  hero: { backgroundColor: colors.brandGreen, borderRadius: radii.xl, overflow: 'hidden' },
  heroPhoto: { height: 130, backgroundColor: '#206543', alignItems: 'center', justifyContent: 'center' },
  heroBody: { padding: spacing.lg, gap: spacing.xs },
  heroPill: {
    alignSelf: 'flex-start', backgroundColor: '#E5A800', borderRadius: radii.pill,
    paddingHorizontal: spacing.md, paddingVertical: 3,
  },
  sectionLabel: { letterSpacing: 1 },
  shelf: { gap: spacing.md },
  shelfCard: {
    width: 150, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, gap: spacing.xs,
  },
  shelfPhoto: {
    height: 84, borderRadius: radii.sm, backgroundColor: '#25714B',
    alignItems: 'center', justifyContent: 'center',
  },
  regionRow: { flexDirection: 'row', gap: spacing.md },
  regionTile: { flex: 1, borderRadius: radii.md, padding: spacing.md, gap: 2 },
}));
