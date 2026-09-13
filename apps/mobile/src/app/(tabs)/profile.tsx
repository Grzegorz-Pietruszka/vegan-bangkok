import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Alert, Modal, TextInput, StyleSheet, Switch, AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { ThemedText } from '@/components/ThemedText';
import { Screen } from '@/components/Screen';
import { useSavedPlaces, resolveSavedPlaces } from '@/saved/savedPlaces';
import { useIdentity } from '@/profile/identity';
import { loadStamps, computeProgress } from '@/passport/stamps';
import { bangkokClassics } from '@/passport/collections';
import { placesSeed } from '@/data/places.seed';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { lunchToggleState, toggleLunchPref, syncLunchNudge } from '@/notifications/lunchNudge';
import { loadAppearancePref, setAppearancePref, type AppearancePref } from '@/theme/appearance';

const AVATAR_EMOJIS = ['🌴', '🍜', '🌶️', '🥭', '🍛', '🧋', '🛵', '🐘'];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const { saved, remove, clear } = useSavedPlaces();
  const { identity, save } = useIdentity();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftEmoji, setDraftEmoji] = useState(AVATAR_EMOJIS[0]);
  const [progress, setProgress] = useState({ eaten: 0, total: bangkokClassics.length, pct: 0 });
  const [notif, setNotif] = useState({ on: true, granted: false });
  const [appearance, setAppearance] = useState<AppearancePref>(null);

  useFocusEffect(useCallback(() => {
    loadStamps()
      .then((s) => setProgress(computeProgress(s, bangkokClassics.map((d) => d.id))))
      .catch(() => {});
    lunchToggleState().then(setNotif).catch(() => {});
    loadAppearancePref().then(setAppearance).catch(() => {});
  }, []));

  // useFocusEffect doesn't re-fire on background→foreground while this tab stays focused —
  // without this, the switch shows stale "off" right after the user grants in iOS Settings
  // (the toggleLunchPref openSettings() round trip). Same AppState idiom as useAppFocusRefetch.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      lunchToggleState()
        .then((s) => {
          setNotif((prev) => {
            // Settings round trip: user granted while we were backgrounded — the switch
            // flips on, so arm the nudge too (transition-gated: never on plain foregrounds).
            if (s.on && s.granted && !prev.granted) void syncLunchNudge();
            return s;
          });
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const savedPlaces = resolveSavedPlaces(saved, placesSeed);

  const confirmClear = () =>
    Alert.alert(t('profile.clear'), t('profile.clearConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.clear'), style: 'destructive', onPress: () => { void clear().then(() => syncLunchNudge()).catch(() => {}); } },
    ]);

  const version = Constants.expoConfig?.version ?? '—';

  const openEdit = () => {
    setDraftName(identity?.name ?? '');
    setDraftEmoji(identity?.emoji ?? AVATAR_EMOJIS[0]);
    setEditing(true);
  };
  const saveEdit = () => {
    void save({ name: draftName, emoji: draftEmoji });
    setEditing(false);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          style={styles.headerRow}
          onPress={openEdit}
          accessibilityRole="button"
          accessibilityLabel={t('profile.identityEdit')}
        >
          <View style={styles.avatar}>
            {identity ? (
              <ThemedText style={styles.avatarEmoji}>{identity.emoji}</ThemedText>
            ) : (
              <Ionicons name="person-circle-outline" size={28} color={colors.textMuted} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            {identity ? (
              <ThemedText variant="h1">{t('profile.greeting', { name: identity.name })}</ThemedText>
            ) : (
              <>
                <ThemedText variant="h1">{t('tabs.profile')}</ThemedText>
                <ThemedText variant="caption" color={colors.textMuted}>{t('profile.setIdentity')}</ThemedText>
              </>
            )}
          </View>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push('/passport' as never)}>
          <ThemedText variant="label" color={colors.primary}>{t('passport.collection')}</ThemedText>
          <ThemedText variant="title">
            {t('passport.eaten', { eaten: progress.eaten, total: progress.total })}
          </ThemedText>
          <View style={styles.barTrack}><View style={[styles.barFill, { width: `${progress.pct}%` }]} /></View>
        </Pressable>

        <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
          {t('profile.savedTitle')} · {savedPlaces.length}
        </ThemedText>
        {savedPlaces.length === 0 ? (
          <ThemedText variant="caption" color={colors.textMuted}>{t('profile.savedEmpty')}</ThemedText>
        ) : (
          savedPlaces.map((p) => (
            <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/place/${p.id}` as never)}>
              <View style={{ flex: 1 }}>
                <ThemedText variant="title">{p.name}</ThemedText>
                <ThemedText variant="caption" color={colors.textMuted}>{p.neighbourhood}</ThemedText>
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => { void remove(p.id).then(() => syncLunchNudge()).catch(() => {}); }}
                accessibilityRole="button"
                accessibilityLabel={t('profile.removeSaved', { name: p.name })}
              >
                <Ionicons name="bookmark" size={20} color={colors.primary} />
              </Pressable>
            </Pressable>
          ))
        )}

        <ThemedText variant="label" color={colors.textMuted} style={styles.sectionLabel}>
          {t('profile.settings')}
        </ThemedText>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ThemedText color={colors.text}>{t('profile.lunchReminder')}</ThemedText>
            <ThemedText variant="caption" color={colors.textMuted}>{t('profile.lunchReminderHint')}</ThemedText>
          </View>
          <Switch
            value={notif.on && notif.granted}
            onValueChange={(v) => { void toggleLunchPref(v).then(setNotif).catch(() => {}); }}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel={t('profile.lunchReminder')}
          />
        </View>
        <View style={styles.row}>
          <ThemedText color={colors.text} style={{ flex: 1 }}>{t('profile.appearance')}</ThemedText>
          {([null, 'light', 'dark'] as AppearancePref[]).map((pref) => {
            const active = appearance === pref;
            const label = t(pref === null ? 'profile.appearanceSystem' : pref === 'light' ? 'profile.appearanceLight' : 'profile.appearanceDark');
            return (
              <Pressable
                key={label}
                style={[styles.appearanceChip, active && styles.appearanceChipActive]}
                onPress={() => { setAppearance(pref); void setAppearancePref(pref); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <ThemedText variant="label" color={active ? colors.onPrimary : colors.primary}>{label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        <Pressable style={styles.row} onPress={confirmClear}>
          <ThemedText color={colors.text}>{t('profile.clear')}</ThemedText>
        </Pressable>
        <ThemedText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.md }}>
          {t('profile.version', { version })}
        </ThemedText>
      </ScrollView>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <TextInput
              style={styles.input}
              defaultValue={identity?.name ?? ''}
              onChangeText={setDraftName}
              placeholder={t('profile.nameLabel')}
              placeholderTextColor={colors.textMuted}
              maxLength={24}
              accessibilityLabel={t('profile.nameLabel')}
            />
            <View style={styles.emojiRow}>
              {AVATAR_EMOJIS.map((emoji) => {
                const selected = emoji === draftEmoji;
                return (
                  <Pressable
                    key={emoji}
                    style={[styles.emojiCircle, selected && styles.emojiSelected]}
                    onPress={() => setDraftEmoji(emoji)}
                    accessibilityRole="button"
                    accessibilityLabel={emoji}
                    accessibilityState={{ selected }}
                  >
                    <ThemedText style={styles.emojiGlyph}>{emoji}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.modalButtons}>
              <Pressable style={styles.modalButton} onPress={() => setEditing(false)} accessibilityRole="button">
                <ThemedText color={colors.textMuted}>{t('common.cancel')}</ThemedText>
              </Pressable>
              <Pressable style={styles.modalButton} onPress={saveEdit} accessibilityRole="button">
                <ThemedText color={colors.primary}>{t('profile.saveName')}</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: radii.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 24, lineHeight: 30 },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  modalCard: {
    alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.lg,
  },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    padding: spacing.md, color: colors.text,
  },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emojiCircle: {
    width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  emojiSelected: { borderWidth: 2, borderColor: colors.primary },
  emojiGlyph: { fontSize: 22, lineHeight: 28 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.xl },
  modalButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  card: {
    marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.lg,
    padding: spacing.lg, gap: spacing.xs, borderWidth: 1, borderColor: colors.border,
  },
  barTrack: { height: 6, borderRadius: radii.pill, backgroundColor: colors.border, overflow: 'hidden', marginTop: spacing.xs },
  barFill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.primary },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  appearanceChip: {
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radii.pill,
    paddingVertical: 6, paddingHorizontal: spacing.md, marginLeft: spacing.sm,
    backgroundColor: colors.surface,
  },
  appearanceChipActive: { backgroundColor: colors.primary },
}));
