import { useRef, useCallback, useMemo, useEffect, useState, type ComponentProps } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Mapbox, {
  MapView, Camera, ShapeSource, SymbolLayer, CircleLayer, Images, Image as MapboxImage, StyleImport,
} from '@rnmapbox/maps';

// OnPressEvent isn't re-exported from the package root in 10.3.1 (and the deep path is
// blocked by its exports map) — derive it from the ShapeSource prop instead.
type OnPressEvent = Parameters<NonNullable<ComponentProps<typeof ShapeSource>['onPress']>>[0];
import { resolveMapConfig, BANGKOK_CENTER, type MapExtra } from '@/map/mapConfig';
import { buildPlacesFeatureCollection, type MapPlace } from '@/map/featureCollection';
import { placesSeed } from '@/data/places.seed';       // bundled offline catalog (M3) — NAMED export
import { useSavedPlaces, resolveSavedPlaces } from '@/saved/savedPlaces';
import { radii } from '@/theme/tokens';
import { useColors, useIsDark, makeThemedStyles } from '@/theme/useTheme';

// require()'d at bundle time — the pin PNGs (Task 4) MUST exist or the whole app bundle fails.
const pinImages = {
  'pin-verified': require('@/map/pins/pin-verified.png'),   // decision (c)
  'pin-community': require('@/map/pins/pin-community.png'),  // decision (c)
};

export function PlacesMap() {
  const router = useRouter();
  const colors = useColors();
  const styles = useStyles();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const shapeRef = useRef<ShapeSource>(null);

  // resolveMapConfig throws on a missing/secret token. Do it INSIDE the component (never at
  // module load — a module-eval throw CANNOT be caught by an error boundary) and degrade to a
  // fallback view instead of taking down the whole Map tab.
  const config = useMemo(() => {
    try {
      return resolveMapConfig((Constants.expoConfig?.extra ?? {}) as MapExtra);
    } catch (err) {
      console.warn('[PlacesMap] map unavailable:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (config) Mapbox.setAccessToken(config.accessToken);   // global, idempotent
  }, [config]);

  // Catalog is static → build the FeatureCollection once. A fresh object identity per render
  // makes rnmapbox re-push & re-cluster the static source (flicker on any re-render).
  const fc = useMemo(() => buildPlacesFeatureCollection(placesSeed as MapPlace[]), []);

  const { t } = useTranslation();
  const { saved } = useSavedPlaces();
  const [savedOnly, setSavedOnly] = useState(false);
  // Saved is user state that changes — keep it OUT of the flicker-sensitive base source.
  const savedFc = useMemo(
    () => buildPlacesFeatureCollection(resolveSavedPlaces(saved, placesSeed as MapPlace[])),
    [saved],
  );

  const onPress = useCallback(async (e: OnPressEvent) => {
    const feature = e.features?.[0] as any;
    if (!feature) return;
    if (feature.properties?.point_count) {                    // a cluster — zoom to expand
      const zoom = await shapeRef.current?.getClusterExpansionZoom(feature);
      cameraRef.current?.setCamera({
        centerCoordinate: feature.geometry.coordinates,
        zoomLevel: (zoom ?? 12) + 0.5,
        animationDuration: 400,
      });
      return;
    }
    const id = feature.properties?.id as string | undefined; // a pin — go to detail
    if (id) router.push(`/place/${id}` as never);
  }, [router]);

  if (!config) {                                              // token missing/invalid — graceful fallback
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>Map unavailable — Mapbox token missing.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MapView style={styles.map} styleURL={config.styleURL} scaleBarEnabled={false} compassEnabled={false}>
        {config.usingFallbackStyle ? (
          // Standard-style import: relight in place — no style reload on theme switch
          <StyleImport id="basemap" existing config={{ lightPreset: isDark ? 'night' : 'day' }} />
        ) : null}
        <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: BANGKOK_CENTER, zoomLevel: 11 }} />
        <Images images={pinImages}>
          {/* View-rendered bookmark badge — visually distinct saved marker until final
              teardrop art lands (open pin-art item), so saved community places can't
              masquerade as verified. */}
          <MapboxImage name="pin-saved">
            <View style={styles.savedMarker}>
              <Ionicons name="bookmark" size={14} color={colors.white} />
            </View>
          </MapboxImage>
        </Images>

        {!savedOnly && (
          <ShapeSource id="places" ref={shapeRef} shape={fc} cluster clusterRadius={50} clusterMaxZoomLevel={14} onPress={onPress}>
            <CircleLayer
              id="clusters"
              filter={['has', 'point_count']}
              style={{
                circleColor: colors.brandGreen,                               // fixed — sits on the light map style
                circleStrokeColor: colors.white,
                circleStrokeWidth: 2,
                circleRadius: ['step', ['get', 'point_count'], 16, 10, 20, 25, 26],
              }}
            />
            <SymbolLayer
              id="cluster-count"
              filter={['has', 'point_count']}
              style={{ textField: ['get', 'point_count_abbreviated'], textSize: 13, textColor: colors.white }}
            />
            <SymbolLayer
              id="pins"
              filter={['!', ['has', 'point_count']]}
              style={{
                iconImage: ['case', ['==', ['get', 'verified'], 1], 'pin-verified', 'pin-community'],
                iconSize: 0.5,             // 60px asset -> 30px teardrop (design 5f)
                iconAnchor: 'bottom',      // tip sits on the coordinate
                iconAllowOverlap: true,
              }}
            />
          </ShapeSource>
        )}

        <ShapeSource id="saved-places" shape={savedFc} onPress={onPress}>
          <SymbolLayer
            id="saved-pins"
            style={{ iconImage: 'pin-saved', iconSize: 1, iconAnchor: 'bottom', iconAllowOverlap: true }}
          />
        </ShapeSource>
      </MapView>

      <Pressable
        style={[styles.filterPill, { top: insets.top + 12 }]}
        onPress={() => setSavedOnly((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ selected: savedOnly }}
      >
        <Ionicons name={savedOnly ? 'bookmark' : 'bookmark-outline'} size={16} color={colors.primary} />
        {/* Label describes what tapping does; doubles as the pill's accessible name. */}
        <Text style={styles.filterText}>{t(savedOnly ? 'map.showAll' : 'map.savedOnly')}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeThemedStyles((colors) => StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fallbackText: { fontSize: 16, textAlign: 'center', color: colors.text },
  filterPill: {
    position: 'absolute', right: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  filterText: { fontSize: 13, color: colors.primary },
  savedMarker: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brandGreen,
    borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
}));
