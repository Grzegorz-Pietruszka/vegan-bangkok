import { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { DishResultCard } from '@/components/DishResultCard';
import { dishesSeed, type BundledDish } from '@/data/dishes.seed';
import { filterDishes } from '@/lib/localSearch';
import { searchDishes } from '@/api/searchDishes';
import { presentError } from '@/errors/presentError';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { Screen } from '@/components/Screen';

const CHIPS = ['spicy', 'soup', 'noodles', 'curry', 'salad', 'sweet', 'mild'];
const FAMOUS = ['Pad kra pao', 'Khao soi', 'Som tam', 'Pad thai', 'Tom kha', 'Mango sticky rice'];
const REGIONS = ['Isaan (northeast)', 'Central Thailand', 'Northern Thailand'];

type Result = { id: string; nameEn: string; sub?: string };

// 5b Discovery — search (API-ranked, local fallback), craving chips, famous grid, regions.
export default function DiscoverScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const { region: regionParam } = useLocalSearchParams<{ region?: string }>();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(regionParam ?? null);
  const [apiResults, setApiResults] = useState<Result[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [searching, setSearching] = useState(false);

  const submit = useCallback(async () => {
    if (!q.trim()) { setApiResults(null); setOffline(false); setDegraded(false); return; }
    setSearching(true);
    try {
      const { results, matchType } = await searchDishes(q.trim());
      setApiResults(results.map((r) => ({ id: r.id, nameEn: r.nameEn, sub: r.regionName ?? undefined })));
      setOffline(false);
      // 'keyword' = API answered from SQL full-text because Gemini was down — flag it
      setDegraded(matchType === 'keyword');
    } catch (e) {
      // API unreachable/offline — local bundle keeps search answering. The "offline
      // results" hint below is the user-visible signal; record silently for monitoring.
      presentError(e, { silent: true });
      setApiResults(filterDishes(dishesSeed, { q }).map((d) => ({ id: d.id, nameEn: d.nameEn, sub: d.regionName ?? undefined })));
      setOffline(true);
      setDegraded(false);
    } finally {
      setSearching(false);
    }
  }, [q]);

  const browse: BundledDish[] = useMemo(() => {
    if (tag || region) return filterDishes(dishesSeed, { tag: tag ?? undefined, region: region ?? undefined });
    return dishesSeed.filter((d) => FAMOUS.includes(d.nameEn));
  }, [tag, region]);

  const goDish = (id: string) => router.push(`/dish/${id}`);

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backCircle} hitSlop={12}>
            <ThemedText variant="title">‹</ThemedText>
          </Pressable>
        </View>
        <ThemedText variant="h1">{t('discover.title')}</ThemedText>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('home.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={submit}
            returnKeyType="search"
            autoCorrect={false}
          />
        </View>

        <Pressable style={styles.scanEntry} onPress={() => router.push('/scan')}>
          <ThemedText variant="title">📷  Scan a menu</ThemedText>
          <ThemedText variant="caption" color={colors.textMuted}>
            photograph any Thai menu — we’ll read it for you
          </ThemedText>
        </Pressable>

        {apiResults !== null ? (
          <View style={styles.results}>
            {offline ? (
              <ThemedText variant="caption" color={colors.communityPillText}>{t('discover.offlineResults')}</ThemedText>
            ) : null}
            {degraded ? (
              <ThemedText variant="caption" color={colors.communityPillText}>{t('discover.degradedResults')}</ThemedText>
            ) : null}
            {searching ? <ThemedText variant="caption" color={colors.textMuted}>…</ThemedText> : null}
            {apiResults.length === 0 ? (
              <ThemedText variant="caption" color={colors.textMuted}>{t('discover.noResults')}</ThemedText>
            ) : (
              apiResults.map((r) => (
                <DishResultCard key={r.id} dish={r} onPress={() => goDish(r.id)} />
              ))
            )}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CHIPS.map((c) => {
            const active = tag === c;
            return (
              <Pressable
                key={c}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => { setTag(active ? null : c); setRegion(null); }}
              >
                <ThemedText variant="label" color={active ? colors.onPrimary : colors.neutralPillText}>{c}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
          {tag || region ? (region ?? tag ?? '').toUpperCase() : t('discover.famous')}
        </ThemedText>
        <View style={styles.grid}>
          {browse.map((d) => (
            <Pressable key={d.id} style={styles.gridCell} onPress={() => goDish(d.id)}>
              <View style={styles.gridPhoto}>
                <ThemedText variant="caption" color={colors.white}>photo</ThemedText>
              </View>
              <ThemedText variant="caption" style={styles.gridName} numberOfLines={2}>{d.nameEn}</ThemedText>
            </Pressable>
          ))}
        </View>

        <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
          {t('discover.regions')}
        </ThemedText>
        {REGIONS.map((r) => (
          <Pressable
            key={r}
            style={styles.regionCard}
            onPress={() => { setRegion(region === r ? null : r); setTag(null); }}
          >
            <ThemedText variant="title">{r}</ThemedText>
            <ThemedText variant="title" color={colors.textMuted}>›</ThemedText>
          </Pressable>
        ))}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg },
  headerRow: { flexDirection: 'row' },
  backCircle: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  searchRow: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.pill, paddingHorizontal: spacing.lg,
  },
  searchInput: { paddingVertical: 13, fontSize: 15, color: colors.text },
  results: { gap: spacing.sm },
  scanEntry: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg, gap: spacing.xs,
  },
  chips: { gap: spacing.sm },
  chip: {
    backgroundColor: colors.neutralPillBg, borderRadius: radii.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary },
  sectionLabel: { letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridCell: { width: '30%', gap: spacing.xs },
  gridPhoto: {
    height: 96, borderRadius: radii.md, backgroundColor: '#25714B',
    alignItems: 'center', justifyContent: 'center',
  },
  gridName: { textAlign: 'center', fontWeight: undefined },
  regionCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg,
  },
}));
