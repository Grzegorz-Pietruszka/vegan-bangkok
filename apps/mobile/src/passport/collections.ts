import { dishesSeed } from '@/data/dishes.seed';

// "Bangkok Classics" — a product construct selected from Greg's curated corpus:
// the 6 handoff famous dishes + 6 canon staples. Review/replace freely.
export const BANGKOK_CLASSICS_NAMES = [
  'Pad kra pao', 'Khao soi', 'Som tam', 'Pad thai', 'Tom kha', 'Mango sticky rice',
  'Pad see ew', 'Gaeng keow wan', 'Massaman curry', 'Tom yum', 'Pak boong fai daeng', 'Spring rolls',
];

export const BADGE_NAME = 'Golden Wok';

export type CollectionDish = { id: string; nameEn: string };

export const bangkokClassics: CollectionDish[] = BANGKOK_CLASSICS_NAMES
  .map((name) => dishesSeed.find((d) => d.nameEn === name))
  .filter((d): d is NonNullable<typeof d> => !!d)
  .map((d) => ({ id: d.id, nameEn: d.nameEn }));
