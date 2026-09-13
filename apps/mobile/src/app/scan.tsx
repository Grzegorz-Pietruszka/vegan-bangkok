import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { MenuScanItem } from '@vegan-bangkok/schemas';
import { ThemedText } from '@/components/ThemedText';
import { DishResultCard } from '@/components/DishResultCard';
import { dishesSeed } from '@/data/dishes.seed';
import { uploadMenuPhoto } from '@/api/scanMenu';
import { presentError } from '@/errors/presentError';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { Screen } from '@/components/Screen';

// 5x menu scan (plan 11, M8): photograph a menu → server OCR + database-first match →
// visual menu of dish cards. Generic lookup — works wherever you are, not tied to a place.
export default function ScanScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const [items, setItems] = useState<MenuScanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [lastUri, setLastUri] = useState<string | null>(null);

  const upload = useCallback(async (uri: string) => {
    setBusy(true); setFailed(false); setErrMsg(null); setLastUri(uri);
    try {
      setItems(await uploadMenuPhoto(uri));
    } catch (e) {
      // silent: the inline retry card owns display here — a toast would double up.
      // presentError still normalizes (safe userMessage, no raw e.message) + logs to Sentry.
      const err = presentError(e, { silent: true });
      setItems(null); setFailed(true);   // visible retry state, never a silent failure
      setErrMsg(err.userMessage);
      console.warn('[scan] upload failed:', e);   // surfaces the real reason in Metro
    } finally {
      setBusy(false);
    }
  }, []);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) await upload(res.assets[0].uri);
  }, [upload]);

  const choosePhoto = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) await upload(res.assets[0].uri);
  }, [upload]);

  // scanned dish ids come from the same corpus the bundle was exported from; only link
  // when the dish is actually in the bundle so dish/[id] never opens on "not found"
  const goDish = (id: string) => {
    if (dishesSeed.some((d) => d.id === id)) router.push(`/dish/${id}`);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backCircle} hitSlop={12}>
            <ThemedText variant="title">‹</ThemedText>
          </Pressable>
        </View>
        <ThemedText variant="h1">Scan a menu</ThemedText>
        <ThemedText variant="caption" color={colors.textMuted}>
          Photograph a Thai menu — we match it against our dish guide and warn about hidden
          animal ingredients. The photo is processed once and never stored.
        </ThemedText>

        <View style={styles.buttonRow}>
          <Pressable style={[styles.primaryPill, busy && styles.disabled]} onPress={takePhoto} disabled={busy}>
            <ThemedText variant="label" color={colors.onPrimary}>Take a photo</ThemedText>
          </Pressable>
          <Pressable style={[styles.secondaryPill, busy && styles.disabled]} onPress={choosePhoto} disabled={busy}>
            <ThemedText variant="label" color={colors.primary}>Choose a photo</ThemedText>
          </Pressable>
        </View>

        {busy ? (
          <ThemedText variant="caption" color={colors.textMuted}>Reading the menu…</ThemedText>
        ) : null}

        {failed && lastUri ? (
          <View style={styles.warnCard}>
            <ThemedText color={colors.warnText}>Couldn’t scan that photo.</ThemedText>
            {errMsg ? <ThemedText variant="caption" color={colors.warnText}>{errMsg}</ThemedText> : null}
            <Pressable style={styles.retryPill} onPress={() => upload(lastUri)}>
              <ThemedText variant="label" color={colors.onPrimary}>Try again</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {items !== null ? (
          <View style={styles.results}>
            <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
              {items.length === 0 ? 'NO READABLE DISHES FOUND — TRY A CLOSER, FLATTER SHOT' : 'WHAT WE FOUND'}
            </ThemedText>
            {items.map((item, i) => <ScanItemCard key={i} item={item} onDish={goDish} />)}
          </View>
        ) : null}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </Screen>
  );
}

function ScanItemCard({ item, onDish }: { item: MenuScanItem; onDish: (id: string) => void }) {
  const colors = useColors();
  const styles = useStyles();
  if (item.type === 'matched') {
    return (
      <View style={styles.itemBlock}>
        <DishResultCard
          dish={{ id: item.dish.id, nameEn: item.dish.nameEn, sub: item.dish.nameTh ?? item.dish.regionName ?? undefined }}
          onPress={() => onDish(item.dish.id)}
        />
        {item.ingredientFlags.length > 0 ? (
          // jay rule: the dish matched, but the line names an animal word — surface it,
          // it is usually a mock-meat name on เจ menus
          <ThemedText variant="caption" color={colors.warnText}>
            menu says “{item.ingredientFlags.map((f) => f.matchedAlias).join(', ')}” — on a jay (เจ) menu
            that’s usually mock meat; double-check with the vendor
          </ThemedText>
        ) : null}
        {item.lowConfidence ? (
          <ThemedText variant="caption" color={colors.textMuted}>low photo quality — match may be off</ThemedText>
        ) : null}
      </View>
    );
  }
  if (item.type === 'ingredient_flagged') {
    return (
      <View testID="ingredient-warning-card" style={styles.warnCard}>
        <ThemedText variant="title" color={colors.warnText}>{item.rawText}</ThemedText>
        {item.ingredientFlags.map((f) => (
          <ThemedText key={f.nameEn} color={colors.warnText}>
            ⚠ mentions {f.matchedAlias} — {f.nameEn}{f.veganRiskClass === 'hard_block' ? ' (not vegan unless mock)' : ''}
          </ThemedText>
        ))}
        <ThemedText variant="caption" color={colors.warnText}>
          not in our guide yet — ask the vendor before ordering
        </ThemedText>
      </View>
    );
  }
  return (
    <View testID="unmatched-card" style={styles.plainCard}>
      <ThemedText variant="title">{item.rawText}</ThemedText>
      {item.translation ? <ThemedText variant="caption">{item.translation}</ThemedText> : null}
      <ThemedText variant="caption" color={colors.textMuted}>Not yet in our guide — noted for our curators.</ThemedText>
    </View>
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
  buttonRow: { flexDirection: 'row', gap: spacing.md },
  primaryPill: {
    flex: 1, borderRadius: radii.pill, backgroundColor: colors.primary,
    alignItems: 'center', paddingVertical: 15,
  },
  secondaryPill: {
    flex: 1, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', paddingVertical: 15,
  },
  disabled: { opacity: 0.5 },
  results: { gap: spacing.md },
  sectionLabel: { letterSpacing: 1 },
  itemBlock: { gap: spacing.xs },
  warnCard: {
    backgroundColor: colors.warnBg, borderColor: colors.warnBorder, borderWidth: 1.5,
    borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm,
  },
  retryPill: {
    borderRadius: radii.pill, backgroundColor: colors.primary,
    alignItems: 'center', paddingVertical: 12, marginTop: spacing.xs,
  },
  plainCard: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg, gap: spacing.xs,
  },
}));
