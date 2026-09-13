import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RouteStep } from '@vegan-bangkok/schemas';
import { radii, spacing } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';

const PREVIEW_LINES = 2;

type Props = {
  step: RouteStep;
  onOpen: (step: RouteStep) => void;
};

export function TourStepCard({ step, onOpen }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const [summaryOverflows, setSummaryOverflows] = useState(false);
  const isSight = step.type === 'site';
  const isExpandable = isSight && Boolean(step.summary) && summaryOverflows;

  const onPress = () => {
    if (isSight) {
      if (isExpandable) setExpanded((current) => !current);
      return;
    }
    onOpen(step);
  };

  const measureSummary = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    setSummaryOverflows(event.nativeEvent.lines.length > PREVIEW_LINES);
  };

  const badge = step.type === 'site' ? 'SIGHT' : step.type === 'dish' ? 'DISH' : 'PLACE';
  const expansionLabel = expanded ? 'Show less' : 'Read more';
  const timelineLabel = step.order === 0 ? 'START' : `${Math.round(step.walkMetersFromPrev ?? 0)} m`;
  const sightAccessibilityLabel = isExpandable
    ? [timelineLabel, step.name, step.nameTh, step.summary, badge, `${expansionLabel} about ${step.name}`]
        .filter(Boolean)
        .join(', ')
    : undefined;

  return (
    <Pressable
      testID={`tour-step-${step.order}`}
      disabled={isSight && !isExpandable}
      onPress={onPress}
      style={styles.stepRow}
      accessibilityRole="button"
      accessibilityState={isSight ? { disabled: !isExpandable, expanded } : undefined}
      accessibilityLabel={sightAccessibilityLabel}
      accessibilityHint={isExpandable ? `${expansionLabel} about ${step.name}` : undefined}
    >
      <View style={styles.rail}>
        <Text style={styles.railText}>{timelineLabel}</Text>
        <View style={styles.railLine} />
      </View>
      <View style={styles.card}>
        <Text style={styles.stepName}>{step.name}</Text>
        {step.nameTh ? <Text style={styles.muted}>{step.nameTh}</Text> : null}
        {step.summary ? (
          <>
            <Text
              testID={`tour-summary-${step.id}`}
              style={styles.stepSummary}
              numberOfLines={isSight && expanded ? undefined : PREVIEW_LINES}
            >
              {step.summary}
            </Text>
            {isSight ? (
              <Text
                testID={`tour-summary-measure-${step.id}`}
                style={[styles.stepSummary, styles.summaryMeasure]}
                onTextLayout={measureSummary}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {step.summary}
              </Text>
            ) : null}
          </>
        ) : null}
        <Text style={styles.badge}>{badge}</Text>
        {isExpandable ? (
          <View style={styles.expansionRow}>
            <Text
              style={styles.expansionText}
              accessibilityLabel={`${expansionLabel} about ${step.name}`}
            >
              {expansionLabel}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.primary}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  stepRow: { flexDirection: 'row', gap: spacing.md, minHeight: 44, marginBottom: spacing.md },
  rail: { width: 56, alignItems: 'center' },
  railText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  railLine: { width: 2, flex: 1, backgroundColor: colors.border, marginTop: 4 },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  stepName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13 },
  stepSummary: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  summaryMeasure: { position: 'absolute', left: spacing.md, right: spacing.md, opacity: 0 },
  badge: { color: colors.primary, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 6 },
  expansionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start',
    minHeight: 44, marginTop: spacing.xs },
  expansionText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
}));
