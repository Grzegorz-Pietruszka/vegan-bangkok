// PURE — no react-native imports (jest-testable like map/featureCollection).
import type { Feature, LineString } from 'geojson';
import type { RouteStep } from '@vegan-bangkok/schemas';

export function routeToLineString(steps: RouteStep[]): Feature<LineString> {
  return {
    type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: steps.map((s) => [s.lng, s.lat]) },
  };
}

export function boundsOf(steps: RouteStep[]): { sw: [number, number]; ne: [number, number] } {
  const lngs = steps.map((s) => s.lng);
  const lats = steps.map((s) => s.lat);
  return {
    sw: [Math.min(...lngs), Math.min(...lats)],
    ne: [Math.max(...lngs), Math.max(...lats)],
  };
}
