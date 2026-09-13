import { useMemo, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import Mapbox, { MapView, Camera, ShapeSource, CircleLayer, SymbolLayer, LineLayer, StyleImport } from '@rnmapbox/maps';
import { resolveMapConfig, type MapExtra } from '@/map/mapConfig';
import { getCurrentRoute } from '@/tour/currentRoute';
import { routeToLineString, boundsOf } from '@/tour/geo';
import { spacing } from '@/theme/tokens';
import { useColors, useIsDark, makeThemedStyles } from '@/theme/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TourMapScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const route = getCurrentRoute();

  const config = useMemo(() => {
    try { return resolveMapConfig((Constants.expoConfig?.extra ?? {}) as MapExtra); }
    catch (err) { console.warn('[TourMap] map unavailable:', err); return null; }
  }, []);
  useEffect(() => { if (config) Mapbox.setAccessToken(config.accessToken); }, [config]);

  const shapes = useMemo(() => {
    if (!route) return null;
    return {
      line: routeToLineString(route.steps),
      stops: {
        type: 'FeatureCollection' as const,
        features: route.steps.map((s) => ({
          type: 'Feature' as const,
          properties: { n: String(s.order + 1) },
          geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
        })),
      },
      bounds: boundsOf(route.steps),
    };
  }, [route]);

  if (!route || !shapes || !config) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          {config ? 'No tour yet — build one on the Food tour tab.' : 'Map unavailable — Mapbox token missing.'}
        </Text>
        <Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView style={styles.map} styleURL={config.styleURL} scaleBarEnabled={false} compassEnabled={false}>
        {config.usingFallbackStyle ? (
          <StyleImport id="basemap" existing config={{ lightPreset: isDark ? 'night' : 'day' }} />
        ) : null}
        <Camera
          defaultSettings={{
            bounds: { sw: shapes.bounds.sw, ne: shapes.bounds.ne,
              paddingLeft: 48, paddingRight: 48, paddingTop: 96, paddingBottom: 96 },
          }}
        />
        <ShapeSource id="tour-line" shape={shapes.line}>
          <LineLayer id="tour-line-layer"
            style={{ lineColor: colors.brandGreen, lineWidth: 3, lineDasharray: [1.5, 1.5] }} />
        </ShapeSource>
        <ShapeSource id="tour-stops" shape={shapes.stops}>
          <CircleLayer id="tour-stop-circles"
            style={{ circleColor: colors.brandGreen, circleRadius: 14,
              circleStrokeColor: colors.white, circleStrokeWidth: 2 }} />
          <SymbolLayer id="tour-stop-numbers"
            style={{ textField: ['get', 'n'], textSize: 13, textColor: colors.white,
              textAllowOverlap: true }} />
        </ShapeSource>
      </MapView>
      <Pressable style={[styles.backCircle, { top: insets.top + spacing.sm }]} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  screen: { flex: 1 },
  map: { flex: 1 },
  backCircle: { position: 'absolute', left: spacing.lg, width: 34, height: 34,
    borderRadius: 17, backgroundColor: colors.bg + 'E6', alignItems: 'center',
    justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border },
  fallback: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xxl, gap: spacing.md },
  fallbackText: { fontSize: 16, textAlign: 'center', color: colors.text },
  link: { color: colors.primary, fontWeight: '600' },
}));
