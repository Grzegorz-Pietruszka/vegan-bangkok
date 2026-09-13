import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, Share, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { bangkokClassics, BADGE_NAME } from '@/passport/collections';
import { loadStamps, computeProgress, earnedByDish, type Stamp } from '@/passport/stamps';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { Screen } from '@/components/Screen';

const ROTATIONS = [-4, 2, -2, 3, -3, 1, -1, 3, -4, 2, -2, 1]; // deterministic per cell
const monoDate = (iso: string) => iso.slice(0, 10);

export default function PassportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const [stamps, setStamps] = useState<Stamp[]>([]);

  // Reload on focus — a stamp earned on the vendor card must show immediately.
  useFocusEffect(useCallback(() => { loadStamps().then(setStamps).catch(() => {}); }, []));

  const progress = computeProgress(stamps, bangkokClassics.map((d) => d.id));
  const earned = earnedByDish(stamps);
  const nextUp = bangkokClassics.find((d) => !earned.has(d.id));
  const remaining = progress.total - progress.eaten;

  const share = () =>
    Share.share({ message: `My Bangkok vegan passport: ${progress.eaten} of ${progress.total} classics eaten 🥬` }).catch(() => {});

  return (
    <Screen>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <ThemedText variant="h1">{t('tabs.passport')}</ThemedText>
        <Pressable style={styles.sharePill} onPress={share}>
          <ThemedText variant="label" color={colors.primary}>{t('passport.share')}</ThemedText>
        </Pressable>
      </View>

      <View style={styles.progressCard}>
        <ThemedText variant="label" color={colors.onBrandDim}>{t('passport.collection')}</ThemedText>
        <ThemedText variant="title" color={colors.onBrand}>
          {t('passport.eaten', { eaten: progress.eaten, total: progress.total })}
        </ThemedText>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${progress.pct}%` }]} />
        </View>
        {remaining > 0 ? (
          <ThemedText variant="caption" color={colors.onBrandDim}>
            {t('passport.badgeHint', { remaining, badge: BADGE_NAME })}
          </ThemedText>
        ) : (
          <ThemedText variant="caption" color="#E5A800">🏅 {BADGE_NAME} earned!</ThemedText>
        )}
      </View>

      <View style={styles.grid}>
        {bangkokClassics.map((d, i) => {
          const stamp = earned.get(d.id);
          return (
            <Pressable
              key={d.id}
              style={styles.cell}
              onPress={() => router.push(`/dish/${d.id}` as never)}
            >
              <View
                style={[
                  styles.stamp,
                  stamp ? styles.stampEarned : styles.stampEmpty,
                  { transform: [{ rotate: `${ROTATIONS[i % ROTATIONS.length]}deg` }] },
                ]}
              >
                {stamp ? <ThemedText variant="title" color={colors.primary}>✓</ThemedText> : null}
                <ThemedText
                  variant="caption"
                  color={stamp ? colors.primary : colors.neutralPillText}
                  numberOfLines={2}
                  style={styles.stampName}
                >
                  {d.nameEn}
                </ThemedText>
                {stamp ? (
                  <ThemedText variant="caption" color={colors.textMuted} style={styles.stampDate}>
                    {monoDate(stamp.eaten_at)}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {nextUp ? (
        <Pressable style={styles.nextCard} onPress={() => router.push(`/dish/${nextUp.id}` as never)}>
          <View style={styles.nextStar}><ThemedText variant="title" color={colors.communityPillText}>★</ThemedText></View>
          <View style={{ flex: 1 }}>
            <ThemedText variant="label" color={colors.textMuted}>{t('passport.nextUp')}</ThemedText>
            <ThemedText variant="title">{nextUp.nameEn}</ThemedText>
          </View>
          <ThemedText variant="title" color={colors.textMuted}>›</ThemedText>
        </Pressable>
      ) : null}
      <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, gap: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sharePill: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.coachBorder,
    borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  progressCard: { backgroundColor: colors.brandGreen, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.sm },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#E5A800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  cell: { width: '30%', alignItems: 'center' },
  stamp: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xs,
  },
  stampEarned: { backgroundColor: colors.verifiedPillBg, borderColor: colors.primary },
  stampEmpty: { backgroundColor: colors.neutralPillBg, borderColor: colors.stampEmptyBorder },
  stampName: { textAlign: 'center' },
  stampDate: { fontSize: 9 },
  nextCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg,
  },
  nextStar: {
    width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.communityPillBg,
    alignItems: 'center', justifyContent: 'center',
  },
}));
