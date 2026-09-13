import * as Location from 'expo-location';

export const OLD_TOWN = { lat: 13.7515, lng: 100.492 } as const;

// Bangkok-only walking tours: if the user is farther than this from Old Town
// (planning a trip from abroad, or testing away from Bangkok), start in Bangkok
// instead of their real position. One knob — tune freely.
export const MAX_KM_FROM_BANGKOK = 100;

// Haversine great-circle distance in km. ponytail: no geo lib for one formula.
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Never throws: any permission/positioning failure — or being too far from
// Bangkok — degrades to the Old Town start, flagged so the UI shows a notice.
export async function getStartPoint(): Promise<{ lat: number; lng: number; fallback: boolean }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ...OLD_TOWN, fallback: true };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (distanceKm(here, OLD_TOWN) > MAX_KM_FROM_BANGKOK) return { ...OLD_TOWN, fallback: true };
    return { ...here, fallback: false };
  } catch {
    return { ...OLD_TOWN, fallback: true };
  }
}
