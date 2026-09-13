import { useQuery } from '@tanstack/react-query';
import { placesSeed } from '@/data/places.seed';
import type { Place } from '@vegan-bangkok/schemas';

export function usePlaces() {
  return useQuery<Place[]>({
    queryKey: ['places'],
    // v1 (M3): no API yet. Return the bundled seed. Swap this for the API fetch in M4.
    queryFn: async () => placesSeed,
    initialData: placesSeed,
    initialDataUpdatedAt: 0,
  });
}
