// Display-only mirror of the server's ITINERARY_PRESETS (apps/api/src/itinerary/presets.ts).
// The server owns vibe tags and defaults; drift risk accepted at 5 entries.
export const TOUR_PRESETS = [
  { id: 'romantic-dinner', label: 'Romantic dinner', icon: 'heart-outline' },
  { id: 'night-walk', label: 'Night walk', icon: 'moon-outline' },
  { id: 'street-food-crawl', label: 'Street-food crawl', icon: 'restaurant-outline' },
  { id: 'temple-and-lunch', label: 'Temples + lunch', icon: 'flower-outline' },
  { id: 'sunset', label: 'Golden hour', icon: 'partly-sunny-outline' },
] as const;
