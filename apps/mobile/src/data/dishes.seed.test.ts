import { dish } from '@vegan-bangkok/schemas';
import { z } from 'zod';
import dishesJson from '../../assets/data/dishes.json';

const bundledDish = dish.extend({
  places: z.array(z.object({ name: z.string(), verifiedVegan: z.boolean(), lovedCount: z.number().int() })),
});

describe('bundled dish catalog', () => {
  it('has the full corpus (>=20 dishes for meaningful screens)', () => {
    expect(dishesJson.length).toBeGreaterThanOrEqual(20);
  });
  it('every entry parses against the shared dish schema + places shape', () => {
    for (const d of dishesJson as unknown[]) {
      const r = bundledDish.safeParse(d);
      if (!r.success) throw new Error(JSON.stringify(r.error.issues));
    }
  });
  it('at least one dish has a verified place (trust tier reachable)', () => {
    const seed = dishesJson as Array<{ places: { verifiedVegan: boolean }[] }>;
    expect(seed.some((d) => d.places.some((p) => p.verifiedVegan))).toBe(true);
  });
});
