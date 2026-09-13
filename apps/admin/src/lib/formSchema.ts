import type { FieldDescriptor } from '@vegan-bangkok/db';

// Turn raw FormData into typed values per descriptor. readOnly fields (id/timestamps/vector)
// are never written. Empty strings become null so optional columns clear correctly.
export function coerceFormData(fields: FieldDescriptor[], form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const fld of fields) {
    if (fld.readOnly) continue;
    const raw = form.get(fld.name);
    if (fld.widget === 'boolean') { out[fld.name] = raw === 'on' || raw === 'true'; continue; }
    const s = raw == null ? '' : String(raw).trim();
    if (s === '') { out[fld.name] = fld.array ? [] : null; continue; }
    if (fld.array) { out[fld.name] = s.split(',').map((x) => x.trim()).filter(Boolean); continue; }
    switch (fld.widget) {
      case 'number': out[fld.name] = Number(s); break;
      case 'json': out[fld.name] = JSON.parse(s); break;
      // drizzle timestamp columns (mode 'date') expect Date instances, not strings.
      case 'date': out[fld.name] = new Date(s); break;
      default: out[fld.name] = s;
    }
  }
  return out;
}
