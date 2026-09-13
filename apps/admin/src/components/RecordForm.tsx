import type { FieldDescriptor } from '@vegan-bangkok/db';
import { Field } from './Field';

export function RecordForm({ action, fields, row, submitLabel }: {
  action: (form: FormData) => Promise<void>;
  fields: FieldDescriptor[]; row?: Record<string, unknown>; submitLabel: string;
}) {
  return (
    <form action={action}>
      {/* rows come from raw SELECT * (snake_case keys); descriptors carry camelCase name + db column */}
      {fields.map((f) => <Field key={f.name} f={f} value={row?.[f.name] ?? row?.[f.column]} />)}
      <div style={{ marginTop: 18 }}><button className="pill pill-dark" type="submit">{submitLabel}</button></div>
    </form>
  );
}
