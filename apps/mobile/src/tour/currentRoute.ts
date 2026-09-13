// Module-level handoff between the tour tab and /tour-map (same pattern as passport
// stamps): no route-param serialization of a full route.
import type { ItineraryResponse } from '@vegan-bangkok/schemas';

let current: ItineraryResponse | null = null;
export function setCurrentRoute(r: ItineraryResponse | null): void { current = r; }
export function getCurrentRoute(): ItineraryResponse | null { return current; }
