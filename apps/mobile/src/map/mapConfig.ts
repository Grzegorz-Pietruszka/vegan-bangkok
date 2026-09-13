// PURE — no react-native / @rnmapbox imports so `node --test` can type-strip & run it.

// Standard (v11) — its lightPreset relights day/night in place, so theme switches
// never reload the style (a styleURL swap repaints visibly; preset changes don't).
export const DEFAULT_STYLE_URL = 'mapbox://styles/mapbox/standard'; // fallback until decision (a)
export const BANGKOK_CENTER: [number, number] = [100.5018, 13.7563]; // [lng, lat]
// [lng, lat] SW + NE — greater-Bangkok bbox (offline pack, Task 8)
export const BANGKOK_BOUNDS = {
  sw: [100.33, 13.49] as [number, number],
  ne: [100.95, 13.98] as [number, number],
};

export type MapExtra = { mapboxToken?: string; mapboxStyleUrl?: string };
export type MapConfig = { accessToken: string; styleURL: string; usingFallbackStyle: boolean };

export function resolveMapConfig(extra: MapExtra): MapConfig {
  // extra wins so tests can pass a token explicitly; app.json ships blank, so in a real
  // run the value comes from EXPO_PUBLIC_MAPBOX_TOKEN in the gitignored .env.local.
  const accessToken = (extra.mapboxToken || process.env.EXPO_PUBLIC_MAPBOX_TOKEN)?.trim();
  if (!accessToken) throw new Error('Missing Mapbox public token (extra.mapboxToken)');
  if (!accessToken.startsWith('pk.')) {
    throw new Error('Mapbox token must be a PUBLIC pk. token — never ship a secret sk. token');
  }
  const custom = extra.mapboxStyleUrl?.trim();
  return { accessToken, styleURL: custom || DEFAULT_STYLE_URL, usingFallbackStyle: !custom };
}
