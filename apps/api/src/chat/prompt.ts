export type ChatCandidate = {
  nameEn: string; nameTh: string | null; description: string | null;
  spiceLevel: number | null; tags: string[];
  placeName: string | null; distanceM: number | null;
};

// Closed-context grounding — same discipline as itinerary narrative and enrich derive:
// the model phrases ONLY what retrieval handed it.
const SYSTEM = [
  'You are a friendly vegan food guide for Bangkok.',
  'Answer using ONLY the dishes listed in the message — never invent dishes, places, prices, or facts.',
  'Recommend 1-2 of the listed dishes that best fit the craving. 2–4 sentences, plain prose, no lists.',
].join('\n');

export function buildChatPrompt(q: string, candidates: ChatCandidate[]): { system: string; user: string } {
  const lines = candidates.map((c, i) => {
    const bits = [
      `${i + 1}. ${c.nameEn}${c.nameTh ? ` (${c.nameTh})` : ''}`,
      c.description,
      c.spiceLevel != null ? `spice ${c.spiceLevel}/5` : null,
      c.tags.length ? `tags: ${c.tags.join(', ')}` : null,
      c.placeName ? `at ${c.placeName}${c.distanceM != null ? `, ${Math.round(c.distanceM)} m away` : ''}` : null,
    ].filter(Boolean);
    return bits.join(' — ');
  });
  return { system: SYSTEM, user: `Craving: ${q}\n\nAvailable dishes:\n${lines.join('\n')}` };
}
