import { offlineManager } from '@rnmapbox/maps';
import { BANGKOK_BOUNDS } from '@/map/mapConfig';

export const BANGKOK_PACK = 'bangkok-core';

// BLOCKED shell (decisions a+b): style-scoped — pass the PUBLISHED cream styleURL, never the
// fallback. Trigger is not wired anywhere yet; wire on first Map open only if (b) = ship.
export async function ensureBangkokPack(styleURL: string) {
  const existing = await offlineManager.getPack(BANGKOK_PACK);
  if (existing) return existing;
  // 10.3.1 signature: createPack(options, progressListener, errorListener?) => Promise<void>
  await offlineManager.createPack(
    {
      name: BANGKOK_PACK,
      styleURL,
      bounds: [BANGKOK_BOUNDS.ne, BANGKOK_BOUNDS.sw], // [NE, SW]
      minZoom: 10,
      maxZoom: 16,
    },
    () => {},
  );
  return offlineManager.getPack(BANGKOK_PACK);
}
