// TranslationProvider seam (plan 11, Task 5). Translation is the LAST-RESORT fallback for
// OCR text nothing in the database matched — a rare path by design, because the Thai food
// domain is closed and database-first. V1 ships ONLY the null provider: callers show the
// raw text and the line is already logged to menu_scan_misses as a curation lead.
//
// The concrete provider (self-hosted Argos/LibreTranslate vs. a paid API at fallback-only
// volume) is the human's own research — wire it in behind this interface later. Do not
// pick one here.

export type TranslationProvider = {
  translate(text: string): Promise<string | null>;
};

export class NullTranslationProvider implements TranslationProvider {
  async translate(_text: string): Promise<string | null> {
    return null;   // no-op: caller falls back to showing the raw OCR text
  }
}
