// Curated deterministic knowledge for the place-search parser and ranker.
// District canonical values MUST match places.neighbourhood contents —
// test/placeConstants.test.ts asserts coverage against seed/data.json.
import { normalizeName } from './normalize.ts';

export type District = {
  canonical: string;
  aliases: string[];               // EN variants + Thai script; matched after normalizeName
  centroid: { lat: number; lng: number };
  radiusM: number;
};

export const DISTRICTS: District[] = [
  { canonical: 'Thonglor',    aliases: ['thong lo', 'thonglo', 'ทองหล่อ'],        centroid: { lat: 13.7263, lng: 100.5782 }, radiusM: 1500 },
  { canonical: 'Ekkamai',     aliases: ['ekamai', 'เอกมัย'],                       centroid: { lat: 13.7196, lng: 100.5853 }, radiusM: 1500 },
  { canonical: 'Asok',        aliases: ['asoke', 'อโศก'],                          centroid: { lat: 13.7367, lng: 100.5602 }, radiusM: 1200 },
  { canonical: 'Phrom Phong', aliases: ['phromphong', 'prompong', 'พร้อมพงษ์'],   centroid: { lat: 13.7305, lng: 100.5698 }, radiusM: 1200 },
  { canonical: 'Chinatown',   aliases: ['yaowarat', 'เยาวราช'],                    centroid: { lat: 13.7398, lng: 100.5096 }, radiusM: 1200 },
  { canonical: 'Khao San',    aliases: ['khaosan', 'khao san road', 'ข้าวสาร'],   centroid: { lat: 13.7588, lng: 100.4972 }, radiusM: 1000 },
  { canonical: 'Phra Nakhon', aliases: ['old town', 'rattanakosin', 'พระนคร'],    centroid: { lat: 13.7527, lng: 100.4948 }, radiusM: 2000 },
  { canonical: 'Bangkok Noi', aliases: ['บางกอกน้อย'],                             centroid: { lat: 13.7622, lng: 100.4757 }, radiusM: 2000 },
  { canonical: 'Pahurat',     aliases: ['phahurat', 'little india', 'พาหุรัด'],    centroid: { lat: 13.7442, lng: 100.5003 }, radiusM: 800 },
  { canonical: 'Lat Phrao',   aliases: ['ladprao', 'lat prao', 'ลาดพร้าว'],       centroid: { lat: 13.8163, lng: 100.6088 }, radiusM: 2500 },
  { canonical: 'Punnawithi',  aliases: ['punnawiti', 'ปุณณวิถี'],                  centroid: { lat: 13.6935, lng: 100.6089 }, radiusM: 1500 },
  // districts users ask for even without seeded places yet:
  { canonical: 'Ari',         aliases: ['aree', 'อารีย์'],                          centroid: { lat: 13.7797, lng: 100.5449 }, radiusM: 1500 },
  { canonical: 'Silom',       aliases: ['สีลม'],                                    centroid: { lat: 13.7286, lng: 100.5347 }, radiusM: 1500 },
  { canonical: 'Sathorn',     aliases: ['sathon', 'สาทร'],                          centroid: { lat: 13.7204, lng: 100.5320 }, radiusM: 1800 },
  { canonical: 'Sukhumvit',   aliases: ['สุขุมวิท'],                                centroid: { lat: 13.7311, lng: 100.5697 }, radiusM: 3500 },
];

// alias lookup is normalized once at module load; canonical names participate as aliases too
const districtByNorm = new Map<string, District>();
for (const d of DISTRICTS) {
  districtByNorm.set(normalizeName(d.canonical), d);
  for (const a of d.aliases) districtByNorm.set(normalizeName(a), d);
}
export function matchDistrict(normToken: string): District | null {
  return districtByNorm.get(normToken) ?? null;
}

// Matched against the raw lowercased query (before normalizeName strips spaces).
export const INTENT_PATTERNS = {
  nearby:     /\b(near me|nearby|around here|close by|walking distance)\b/i,
  best:       /\b(best|top|top[- ]rated|greatest)\b/i,
  hiddenGems: /\b(hidden gem|hidden gems|hole in the wall|local secret|no tourists|off the beaten)\b/i,
  popular:    /\b(popular|famous|well[- ]known|trending)\b/i,
  cheap:      /\b(cheap|budget|affordable|inexpensive)\b/i,
  openNow:    /\b(open now|open late|still open)\b/i,
  planning:   /\b(plan|itinerary|day trip|food crawl|crawl)\b/i,
} as const;

export const VENUE_WORDS = ['cafe', 'coffee', 'restaurant', 'buffet', 'bakery', 'streetfood', 'bar', 'eatery']
  .map((w) => normalizeName(w));

// Cheap → price_band cap. Bands are 1–4 (schema check constraint).
export const CHEAP_PRICE_MAX = 2;

export type RankWeights = { relevance: number; distance: number; popularity: number; vibe: number };
// hidden_gems inverts popularity — that IS the hidden-gems mechanism (spec §5).
// Numbers are starting points; tune via eval harness, keep structure.
export const RANK_WEIGHTS: Record<'entity' | 'nearby' | 'best' | 'discovery' | 'hidden_gems' | 'planning', RankWeights> = {
  entity:      { relevance: 0.6, distance: 0.2, popularity: 0.1,  vibe: 0.1 },
  nearby:      { relevance: 0.3, distance: 0.5, popularity: 0.1,  vibe: 0.1 },
  best:        { relevance: 0.3, distance: 0.1, popularity: 0.5,  vibe: 0.1 },
  discovery:   { relevance: 0.3, distance: 0.1, popularity: 0.2,  vibe: 0.4 },
  hidden_gems: { relevance: 0.3, distance: 0.1, popularity: -0.2, vibe: 0.4 },
  planning:    { relevance: 0.3, distance: 0.1, popularity: 0.2,  vibe: 0.4 },
};

export const CONFIDENCE_THRESHOLD = 0.7;
export const NEAR_ME_RADIUS_M = 2000;
export const RRF_K = 60;
