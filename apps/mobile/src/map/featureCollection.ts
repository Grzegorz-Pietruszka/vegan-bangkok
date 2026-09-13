// PURE — only type-only imports (erased at runtime), so `node --test` can run it.
import type { FeatureCollection, Point } from 'geojson';
import type { Place } from '@vegan-bangkok/schemas';

// Catalog may carry a place-level trust rollup; absent => community tier. See cross-plan note.
export type MapPlace = Place & { verified?: boolean };

export type PlaceFeatureProps = {
  id: string;
  name: string;
  neighbourhood: string;
  veganStatus: Place['veganStatus'];
  verified: 0 | 1;   // numeric — Mapbox expressions want numbers, not JS booleans
};

export function buildPlacesFeatureCollection(
  places: MapPlace[],
): FeatureCollection<Point, PlaceFeatureProps> {
  const features = places
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => {
      const verified: 0 | 1 = p.verified ? 1 : 0;
      return {
        type: 'Feature' as const,
        id: p.id,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          name: p.name,
          neighbourhood: p.neighbourhood,
          veganStatus: p.veganStatus,
          verified,
        } satisfies PlaceFeatureProps,
      };
    });
  return { type: 'FeatureCollection', features };
}
