'use server';
import { sql, getTableName, eq } from 'drizzle-orm';
import { db, tableRegistry, describeTable } from '@/lib/db';
import { assertTable } from '@/lib/tables';
import { coerceFormData } from '@/lib/formSchema';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function tableFor(table: string) {
  assertTable(table);
  return (tableRegistry as Record<string, any>)[table];
}

export async function createRow(table: string, form: FormData): Promise<void> {
  const t = tableFor(table);
  const values = coerceFormData(describeTable(table), form);
  await db.insert(t).values(values);
  revalidatePath(`/${table}`);
  redirect(`/${table}`);
}

export async function updateRow(table: string, id: string, form: FormData): Promise<void> {
  const t = tableFor(table);
  const values = coerceFormData(describeTable(table), form);
  await db.update(t).set(values).where(eq((t as any).id, id));
  revalidatePath(`/${table}`);
  redirect(`/${table}`);
}

export async function deleteRow(table: string, id: string): Promise<{ error?: string }> {
  const t = tableFor(table);
  try {
    await db.delete(t).where(eq((t as any).id, id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete failed';
    // drizzle 0.45 wraps pg errors in DrizzleQueryError; the pg detail lives on .cause.
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : '';
    // Postgres FK violation → readable message instead of a crash.
    if (/foreign key|violates/i.test(`${msg} ${cause}`)) return { error: 'Cannot delete: other rows reference this record.' };
    return { error: msg };
  }
  revalidatePath(`/${table}`);
  redirect(`/${table}`);
}
