import placesJson from '../../assets/data/places.json';
import type { Place } from '@vegan-bangkok/schemas';

// Bundled offline catalog. Cast to the shared Zod-inferred Place[] (produced by the M2 schemas package).
// Not re-validated at runtime here — the seed is curated and checked by the unit test below.
export const placesSeed = placesJson as unknown as Place[];
