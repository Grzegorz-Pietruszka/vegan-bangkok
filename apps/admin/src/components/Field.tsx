import type { FieldDescriptor } from '@vegan-bangkok/db';
import { FkPicker } from './FkPicker';

export function Field({ f, value }: { f: FieldDescriptor; value: unknown }) {
  if (f.widget === 'hidden') return null;
  const v = value ?? '';
  const common = { name: f.name, required: f.required, defaultValue: f.array && Array.isArray(value) ? (value as string[]).join(', ') : String(v) };
  return (
    <div>
      <label htmlFor={f.name}>{f.name}{f.required ? ' *' : ''}{f.array ? ' (comma-separated)' : ''}{f.readOnly ? ' (read-only)' : ''}</label>
      {renderInput(f, value, common)}
    </div>
  );
}

function renderInput(f: FieldDescriptor, value: unknown, common: any) {
  if (f.readOnly) return <input {...common} readOnly disabled />;
  if (f.widget === 'fk') return <FkPicker name={f.name} fkTable={f.fkTable!} value={value ? String(value) : undefined} required={f.required} />;
  if (f.widget === 'enum') return (
    <select name={f.name} defaultValue={value ? String(value) : ''} required={f.required}>
      <option value="">—</option>
      {f.enumValues!.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  if (f.widget === 'boolean') return <input type="checkbox" name={f.name} defaultChecked={value === true} style={{ width: 'auto' }} />;
  if (f.widget === 'json') return <textarea name={f.name} rows={4} defaultValue={value ? JSON.stringify(value, null, 2) : ''} />;
  if (f.widget === 'number') return <input {...common} type="number" step="any" />;
  if (f.widget === 'date') return <input {...common} defaultValue={value instanceof Date ? value.toISOString() : (value ? String(value) : '')} placeholder="ISO timestamp" />;
  // Multi-line text: a single-line <input> silently strips CR/LF on save.
  if (f.long) return <textarea {...common} rows={4} />;
  return <input {...common} />;
}
