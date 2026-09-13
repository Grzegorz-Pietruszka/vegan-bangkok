import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { useColors, makeThemedStyles } from '@/theme/useTheme';

// Feathered edge under the top inset: a short SOLID run that continues the strip
// (opacity 1 — seamless, so no hard line), then a quick gradient down into the
// content. i.e. "straight line at the same value, then a gradient." Stacked 1px
// bands = a gradient at this size — no native gradient dep. Tune the two lengths.
// ponytail: a few Views beat adding expo-linear-gradient for ~16px of polish.
const FADE_SOLID_PX = 6;     // continues the strip at full bg — the "straight line, same value"
const FADE_FEATHER_PX = 10;  // quick gradient from full bg → transparent, into the content
const FADE = [
  ...Array<number>(FADE_SOLID_PX).fill(1),
  ...Array.from({ length: FADE_FEATHER_PX }, (_, i) => 1 - (i + 1) / FADE_FEATHER_PX),
];

const featherBands = (bg: string) =>
  FADE.map((opacity, i) => <View key={i} style={{ height: 1, backgroundColor: bg, opacity }} />);

// ponytail: one home for screen-level safe-area. Plain ScrollView screens wrap in this so
// no render path can miss the inset. Edge-to-edge screens (hero image / full-bleed map:
// dish, place, map, tour-map) use the useSafeAreaInsets hook directly — a wrapper would
// push their bleeding background down.
export function Screen({ children, edges = ['top'] }: { children: ReactNode; edges?: readonly Edge[] }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useStyles();
  const top = edges.includes('top') ? insets.top : 0;
  const bottom = edges.includes('bottom') ? insets.bottom : 0;
  return (
    <View style={[styles.root, { paddingTop: top, paddingBottom: bottom }]}>
      {children}
      {top > 0 ? (
        <View pointerEvents="none" style={[styles.fade, { top }]}>
          {featherBands(colors.bg)}
        </View>
      ) : null}
    </View>
  );
}

// Full top scrim: a solid status-bar strip (height = inset) plus the same feather.
// For edge-to-edge screens (dish/place) — render inside a scroll-driven Animated.View
// so it fades in only once the hero image has scrolled up under the status bar.
export function TopInsetScrim({ top }: { top: number }) {
  const colors = useColors();
  return (
    <>
      <View style={{ height: top, backgroundColor: colors.bg }} />
      {featherBands(colors.bg)}
    </>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fade: { position: 'absolute', left: 0, right: 0 },
}));
