import { useState } from 'react';
import { View, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { DishResult } from '@vegan-bangkok/schemas';
import { ThemedText } from '@/components/ThemedText';
import { DishResultCard } from '@/components/DishResultCard';
import { streamCraving } from '@/api/chat';
import { presentError } from '@/errors/presentError';
import { getStartPoint } from '@/tour/location';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';
import { Screen } from '@/components/Screen';

type Phase = 'idle' | 'streaming' | 'done' | 'error';

export default function ChatScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const [phase, setPhase] = useState<Phase>('idle');
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [results, setResults] = useState<DishResult[]>([]);
  const [degraded, setDegraded] = useState<string | undefined>();
  const [errMsg, setErrMsg] = useState('');

  const ask = async () => {
    if (!q.trim()) return;
    setPhase('streaming'); setAnswer(''); setResults([]); setDegraded(undefined);
    const start = await getStartPoint();
    // Fallback coords are an old-town default, not the user's position — omitting
    // location keeps the server honest (no distance re-rank / "850 m away" prose).
    await streamCraving(
      start.fallback
        ? { q: q.trim() }
        : { q: q.trim(), location: { lat: start.lat, lng: start.lng } },
      {
        onResults: setResults,
        onToken: (t) => setAnswer((prev) => prev + t),
        onDone: (d) => { setDegraded(d); setPhase('done'); },
        // silent: the inline bubble owns display — normalized message says offline vs
        // timeout vs server instead of one generic line; original still goes to Sentry.
        onError: (e) => { setErrMsg(presentError(e, { silent: true }).userMessage); setPhase('error'); },
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.xl }}>
      <Pressable style={styles.backCircle} onPress={() => router.back()}>
        <ThemedText color={colors.primary}>‹</ThemedText>
      </Pressable>
      <ThemedText variant="h1">What are you craving?</ThemedText>
      <TextInput
        testID="chat-input"
        style={styles.input}
        placeholder="“something not spicy near me”"
        placeholderTextColor={colors.textMuted}
        value={q}
        onChangeText={setQ}
        maxLength={200}
        editable={phase !== 'streaming'}
      />
      <Pressable testID="ask-btn" style={[styles.askBtn, phase === 'streaming' && styles.btnDisabled]}
        disabled={phase === 'streaming'} onPress={ask}>
        <ThemedText color={colors.onPrimary}>{phase === 'streaming' ? 'Thinking…' : 'Ask'}</ThemedText>
      </Pressable>

      {phase === 'error' ? (
        <View style={styles.bubble} accessibilityRole="alert">
          <ThemedText>{errMsg}</ThemedText>
        </View>
      ) : null}

      {answer ? (
        <View style={styles.bubble}><ThemedText>{answer}</ThemedText></View>
      ) : null}
      {degraded ? (
        <ThemedText variant="caption" color={colors.textMuted} style={styles.hint}>
          Simpler wording right now — the full guide is offline.
        </ThemedText>
      ) : null}

      <View style={styles.cards}>
        {results.map((r) => (
          <DishResultCard
            key={r.id}
            dish={{ id: r.id, nameEn: r.nameEn, sub: r.description ?? r.regionName ?? undefined }}
            onPress={() => router.push(`/dish/${r.id}` as never)}
          />
        ))}
      </View>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface,
    padding: spacing.md, fontSize: 14, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },
  askBtn: { backgroundColor: colors.primary, borderRadius: radii.pill, paddingVertical: 12,
    alignItems: 'center', marginBottom: spacing.lg },
  btnDisabled: { opacity: 0.6 },
  bubble: { backgroundColor: colors.verifiedPillBg, borderRadius: radii.lg, padding: spacing.lg,
    marginBottom: spacing.sm },
  hint: { marginBottom: spacing.md },
  cards: { gap: spacing.sm },
}));
