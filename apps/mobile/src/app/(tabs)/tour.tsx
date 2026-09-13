import { useState, type ReactNode } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ItineraryResponse, TimeOfDay } from '@vegan-bangkok/schemas';
import { fetchItinerary, type TourRequest } from '@/api/itinerary';
import { presentError } from '@/errors/presentError';
import { TOUR_PRESETS } from '@/tour/presets';
import { formatTourMeta } from '@/tour/meta';
import { setCurrentRoute } from '@/tour/currentRoute';
import { getStartPoint } from '@/tour/location';
import { BANGKOK_AREAS } from '@/tour/areas';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { Screen } from '@/components/Screen';
import { TourStepCard } from '@/components/TourStepCard';

type Phase = 'intent' | 'loading' | 'result' | 'error' | 'empty';

const WHEN_OPTIONS: { slot: TimeOfDay; label: string }[] = [
  { slot: 'daytime', label: 'Daytime' },
  { slot: 'sunset', label: 'Sunset' },
  { slot: 'evening', label: 'Evening' },
];
const LENGTH_OPTIONS: { stops: number; label: string }[] = [
  { stops: 2, label: 'Quick · 2' },
  { stops: 4, label: 'Medium · 4' },
  { stops: 6, label: 'Long · 6' },
];

export default function TourScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const [phase, setPhase] = useState<Phase>('intent');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [route, setRoute] = useState<ItineraryResponse | null>(null);
  const [usedFallbackStart, setUsedFallbackStart] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [startAreaId, setStartAreaId] = useState<string | null>(null); // null = Near me
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);
  const [maxStops, setMaxStops] = useState<number | null>(null);

  const canGenerate = presetId !== null || text.trim().length > 0;

  const generate = async (radiusM?: number) => {
    setPhase('loading');
    try {
      const area = startAreaId ? BANGKOK_AREAS.find((a) => a.id === startAreaId) : null;
      let start: { lat: number; lng: number };
      if (area) {
        start = { lat: area.lat, lng: area.lng };
        setUsedFallbackStart(false);
      } else {
        const sp = await getStartPoint();
        setUsedFallbackStart(sp.fallback);
        start = { lat: sp.lat, lng: sp.lng };
      }
      const req: TourRequest = { start };
      if (presetId) req.presetId = presetId;
      if (text.trim()) req.text = text.trim();
      if (timeOfDay) req.timeOfDay = timeOfDay;
      if (maxStops) req.maxStops = maxStops;
      if (radiusM) req.radiusM = radiusM;
      const res = await fetchItinerary(req);
      if (res.steps.length === 0) { setPhase('empty'); return; }
      setRoute(res);
      setCurrentRoute(res);
      setPhase('result');
    } catch (e) {
      // silent: this full-screen retry state owns display; message now says offline vs
      // timeout vs server instead of always blaming the connection. Sentry gets the raw error.
      setErrMsg(presentError(e, { silent: true }).userMessage);
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('intent'); setRoute(null); setCurrentRoute(null);
    setShowDetails(false); setStartAreaId(null); setTimeOfDay(null); setMaxStops(null);
  };

  // One root, wrapped once in <Screen> — every phase gets the top inset, none can be missed.
  let content: ReactNode;
  if (phase === 'loading') {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.muted}>Building your walk…</Text>
      </View>
    );
  } else if (phase === 'error') {
    content = (
      <View style={styles.center} accessibilityRole="alert">
        <Text style={styles.title}>Couldn’t build the tour</Text>
        <Text style={styles.muted}>{errMsg}</Text>
        <Pressable testID="retry-btn" style={styles.primaryBtn} onPress={() => generate()}>
          <Text style={styles.primaryBtnText}>Retry</Text>
        </Pressable>
        <Pressable onPress={reset}><Text style={styles.link}>Start over</Text></Pressable>
      </View>
    );
  } else if (phase === 'empty') {
    content = (
      <View style={styles.center}>
        <Text style={styles.title}>Nothing walkable nearby</Text>
        <Text style={styles.muted}>No stops match within walking range. Widen the search?</Text>
        <Pressable testID="widen-btn" style={styles.primaryBtn} onPress={() => generate(5000)}>
          <Text style={styles.primaryBtnText}>Search wider (5 km)</Text>
        </Pressable>
        <Pressable onPress={reset}><Text style={styles.link}>Start over</Text></Pressable>
      </View>
    );
  } else if (phase === 'result' && route) {
    const preset = TOUR_PRESETS.find((p) => p.id === presetId);
    content = (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.xl }}>
        <Text style={styles.eyebrow}>{(preset?.label ?? 'Custom tour').toUpperCase()}</Text>
        <Text style={styles.title}>{text.trim() || preset?.label || 'Your walking tour'}</Text>
        <Text style={styles.meta}>{formatTourMeta(route.steps)}</Text>
        {route.degraded ? (
          <Text style={styles.hint}>Simpler matching/wording right now — service degraded.</Text>
        ) : null}
        {usedFallbackStart ? (
          <Text style={styles.hint}>Using the old town as start — location was unavailable.</Text>
        ) : null}
        {route.narrative ? <Text style={styles.narrative}>{route.narrative}</Text> : null}
        <Pressable testID="view-map-btn" style={styles.mapPill} onPress={() => router.push('/tour-map' as never)}>
          <Ionicons name="map-outline" size={16} color={colors.primary} />
          <Text style={styles.mapPillText}>View on map</Text>
        </Pressable>
        {route.steps.map((step) => (
          <TourStepCard
            key={step.id}
            step={step}
            onOpen={(selected) => router.push(`/${selected.type}/${selected.id}` as never)}
          />
        ))}
        <Pressable testID="new-tour-btn" style={styles.secondaryBtn} onPress={reset}>
          <Text style={styles.secondaryBtnText}>New tour</Text>
        </Pressable>
      </ScrollView>
    );
  } else {
    content = (
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.xl }}>
        <Text style={styles.eyebrow}>FOOD TOUR</Text>
        <Text style={styles.title}>Plan your walk</Text>
        <Text style={styles.clarity}>Describe it, tap to build it, or both.</Text>

        <Text style={styles.sectionLabel}>Describe it (optional)</Text>
        <TextInput
          testID="tour-text-input"
          style={styles.input}
          placeholder="“quiet riverside sunset with dessert”"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          maxLength={200}
        />

        <Text style={styles.sectionLabel}>Or tap a vibe</Text>
        <View style={styles.chipWrap}>
          {TOUR_PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPresetId(presetId === p.id ? null : p.id)}
              style={[styles.chip, presetId === p.id && styles.chipActive]}
            >
              <Ionicons name={p.icon as never} size={16}
                color={presetId === p.id ? colors.onPrimary : colors.primary} />
              <Text style={[styles.chipText, presetId === p.id && styles.chipTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          testID="details-toggle"
          style={styles.detailsToggle}
          onPress={() => setShowDetails((v) => !v)}
        >
          <Ionicons name={showDetails ? 'chevron-down' : 'add'} size={16} color={colors.primary} />
          <Text style={styles.detailsToggleText}>
            {(() => {
              const n = (startAreaId ? 1 : 0) + (timeOfDay ? 1 : 0) + (maxStops ? 1 : 0);
              return n ? `Details (${n})` : 'Add details';
            })()}
          </Text>
        </Pressable>
        {showDetails ? (
          <View style={styles.panel}>
            <Text style={styles.sectionLabel}>Start</Text>
            <View style={styles.chipWrap}>
              <Pressable
                testID="area-near-me"
                onPress={() => setStartAreaId(null)}
                style={[styles.chip, startAreaId === null && styles.chipActive]}
              >
                <Ionicons name="location" size={14}
                  color={startAreaId === null ? colors.onPrimary : colors.primary} />
                <Text style={[styles.chipText, startAreaId === null && styles.chipTextActive]}>Near me</Text>
              </Pressable>
              {BANGKOK_AREAS.map((a) => (
                <Pressable
                  key={a.id}
                  testID={`area-${a.id}`}
                  onPress={() => setStartAreaId(startAreaId === a.id ? null : a.id)}
                  style={[styles.chip, startAreaId === a.id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, startAreaId === a.id && styles.chipTextActive]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sectionLabel}>When</Text>
            <View style={styles.chipWrap}>
              {WHEN_OPTIONS.map((o) => (
                <Pressable
                  key={o.slot}
                  testID={`when-${o.slot}`}
                  onPress={() => setTimeOfDay(timeOfDay === o.slot ? null : o.slot)}
                  style={[styles.chip, timeOfDay === o.slot && styles.chipActive]}
                >
                  <Text style={[styles.chipText, timeOfDay === o.slot && styles.chipTextActive]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sectionLabel}>Length</Text>
            <View style={styles.chipWrap}>
              {LENGTH_OPTIONS.map((o) => (
                <Pressable
                  key={o.stops}
                  testID={`length-${o.stops}`}
                  onPress={() => setMaxStops(maxStops === o.stops ? null : o.stops)}
                  style={[styles.chip, maxStops === o.stops && styles.chipActive]}
                >
                  <Text style={[styles.chipText, maxStops === o.stops && styles.chipTextActive]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <Pressable
          testID="generate-btn"
          disabled={!canGenerate}
          style={[styles.primaryBtn, !canGenerate && styles.btnDisabled]}
          onPress={() => generate()}
        >
          <Text style={styles.primaryBtnText}>Build my walk</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return <Screen>{content}</Screen>;
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  eyebrow: { color: colors.communityPillText, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs },
  title: { color: colors.text, fontSize: 23, fontWeight: '700', marginBottom: spacing.sm },
  clarity: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.sm },
  meta: { color: colors.primary, fontSize: 13, fontWeight: '600', marginBottom: spacing.md },
  narrative: { color: colors.text, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
  hint: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic', marginBottom: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: colors.onPrimary },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface,
    padding: spacing.md, fontSize: 14, color: colors.text, marginBottom: spacing.lg },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radii.pill, paddingVertical: 14,
    alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
  secondaryBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radii.pill,
    paddingVertical: 12, alignItems: 'center', marginTop: spacing.xl },
  secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  link: { color: colors.primary, fontWeight: '600', marginTop: spacing.sm },
  mapPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: radii.pill,
    paddingVertical: 6, paddingHorizontal: 12, marginBottom: spacing.lg, backgroundColor: colors.surface },
  mapPillText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  detailsToggleText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  panel: { marginBottom: spacing.sm },
}));
