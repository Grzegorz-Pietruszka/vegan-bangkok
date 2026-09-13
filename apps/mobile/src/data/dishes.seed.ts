import dishesJson from '../../assets/data/dishes.json';
import type { Dish } from '@vegan-bangkok/schemas';

// Bundled dish catalog — exported from the seeded DB (Greg's curated corpus, canonical UUIDs)
// by apps/api/scripts/export-bundle.ts. Denormalized places for display; place-detail links
// resolve by name against places.seed until the real catalog regenerates both files.
export type BundledDish = Dish & {
  places: { name: string; verifiedVegan: boolean; lovedCount: number }[];
};

export const dishesSeed = dishesJson as unknown as BundledDish[];
