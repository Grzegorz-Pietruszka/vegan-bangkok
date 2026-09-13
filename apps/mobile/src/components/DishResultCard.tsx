import { Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { spacing, radii } from '@/theme/tokens';
import { useColors, makeThemedStyles } from '@/theme/useTheme';

// The one dish-result card: Discovery search results and the menu-scan screen both render
// this (extracted from Discovery's inline row when the scan screen became a second consumer).
export type DishCardData = { id: string; nameEn: string; sub?: string };

export function DishResultCard({ dish, onPress }: { dish: DishCardData; onPress?: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable testID="dish-result-card" style={styles.card} onPress={onPress}>
      <ThemedText variant="title">{dish.nameEn}</ThemedText>
      {dish.sub ? <ThemedText variant="caption" color={colors.textMuted}>{dish.sub}</ThemedText> : null}
    </Pressable>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg,
  },
}));
