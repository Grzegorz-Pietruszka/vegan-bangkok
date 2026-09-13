// Static neighborhood centroids so a walk can be planned somewhere other than the user's
// GPS position (e.g. a Sukhumvit resident planning a Chinatown crawl). Bangkok-only app,
// so a fixed list is fine. Coords are approximate area centroids — tune freely.
// "Near me" (live GPS) is not in this list; the UI represents it as startAreaId === null.
export type BangkokArea = { id: string; label: string; lat: number; lng: number };

export const BANGKOK_AREAS: readonly BangkokArea[] = [
  { id: 'old-town', label: 'Old Town', lat: 13.7515, lng: 100.492 },
  { id: 'chinatown', label: 'Chinatown', lat: 13.74, lng: 100.509 },
  { id: 'sukhumvit', label: 'Sukhumvit', lat: 13.7376, lng: 100.5602 },
  { id: 'silom', label: 'Silom', lat: 13.7248, lng: 100.534 },
  { id: 'ari', label: 'Ari', lat: 13.7797, lng: 100.544 },
  { id: 'thonglor', label: 'Thonglor', lat: 13.73, lng: 100.582 },
  { id: 'riverside', label: 'Riverside', lat: 13.722, lng: 100.514 },
  { id: 'victory', label: 'Victory Monument', lat: 13.765, lng: 100.538 },
] as const;
