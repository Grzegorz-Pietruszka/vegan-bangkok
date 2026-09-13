import type { VibeTag } from '../enrich/vibeVocab.ts';

// Ordered slot vocabularies (plan 10, v1 EASY ordering tier). No TS enums by decision.
// TIME_SLOTS values must equal the shared `timeOfDay` schema enum — asserted in tests.
export const TIME_SLOTS = ['daytime', 'sunset', 'evening'] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export const COURSE_ORDER = ['starter', 'main', 'dessert'] as const;
export type CourseSlot = (typeof COURSE_ORDER)[number];

export type ItineraryPreset = {
  id: string;
  label: string;
  icon: string;
  vibeTags: readonly VibeTag[];
  courseShape: readonly CourseSlot[];   // may repeat ('main','main') — a crawl hits two mains
  defaults: { timeOfDay?: TimeSlot; radiusM?: number; maxStops?: number };
};

export const ITINERARY_PRESETS = [
  {
    id: 'romantic-dinner', label: 'Romantic dinner', icon: '🌹',
    vibeTags: ['romantic', 'riverside', 'quiet', 'upscale'],
    courseShape: ['starter', 'main', 'dessert'],
    defaults: { timeOfDay: 'evening', maxStops: 4 },
  },
  {
    id: 'night-walk', label: 'Night walk', icon: '🌙',
    vibeTags: ['late-night', 'night-market', 'scenic-view', 'local-favorite'],
    courseShape: ['main', 'dessert'],
    defaults: { timeOfDay: 'evening', radiusM: 3000 },
  },
  {
    id: 'street-food-crawl', label: 'Street-food crawl', icon: '🍜',
    vibeTags: ['street-food', 'night-market', 'hole-in-the-wall', 'local-favorite', 'budget-friendly'],
    courseShape: ['main', 'main', 'dessert'],
    defaults: { maxStops: 5 },
  },
  {
    id: 'temple-and-lunch', label: 'Temples + lunch', icon: '🛕',
    vibeTags: ['temple-visit', 'historic', 'old-town', 'quiet'],
    courseShape: ['main'],
    defaults: { timeOfDay: 'daytime', radiusM: 2000 },
  },
  {
    id: 'sunset', label: 'Golden hour', icon: '🌇',
    vibeTags: ['sunset', 'scenic-view', 'riverside', 'rooftop'],
    courseShape: ['main'],
    defaults: { timeOfDay: 'sunset' },
  },
] as const satisfies readonly ItineraryPreset[];

export type PresetId = (typeof ITINERARY_PRESETS)[number]['id'];

export function findPreset(id: string): ItineraryPreset | undefined {
  return ITINERARY_PRESETS.find((p) => p.id === id);
}
