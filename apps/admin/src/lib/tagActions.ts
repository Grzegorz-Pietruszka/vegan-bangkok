'use server';
import { and, eq, inArray, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tags, dishTags, ingredientTags } from '@vegan-bangkok/db/schema';
import { revalidatePath } from 'next/cache';

export type TagRow = { id: string; facet: string; nameEn: string };

const linkTable = (table: 'dishes' | 'ingredients') => (table === 'dishes' ? dishTags : ingredientTags);
const linkCol = (table: 'dishes' | 'ingredients') => (table === 'dishes' ? dishTags.dishId : ingredientTags.ingredientId);
const tagCol = (table: 'dishes' | 'ingredients') => (table === 'dishes' ? dishTags.tagId : ingredientTags.tagId);

export async function loadVocabulary(): Promise<TagRow[]> {
  return db.select({ id: tags.id, facet: tags.facet, nameEn: tags.nameEn })
    .from(tags).orderBy(asc(tags.facet), asc(tags.nameEn));
}

export async function loadEntityTagIds(table: 'dishes' | 'ingredients', id: string): Promise<string[]> {
  const rows = await db.select({ tagId: tagCol(table) }).from(linkTable(table)).where(eq(linkCol(table), id));
  return rows.map((r) => r.tagId);
}

// Diff the desired set against current links: delete removed, insert added. Idempotent.
export async function setEntityTags(table: 'dishes' | 'ingredients', id: string, tagIds: string[]): Promise<{ error?: string }> {
  try {
    const current = new Set(await loadEntityTagIds(table, id));
    const desired = new Set(tagIds);
    const toAdd = [...desired].filter((t) => !current.has(t));
    const toRemove = [...current].filter((t) => !desired.has(t));
    await db.transaction(async (tx) => {
      if (toRemove.length) {
        await tx.delete(linkTable(table)).where(and(eq(linkCol(table), id), inArray(tagCol(table), toRemove)));
      }
      if (toAdd.length) {
        await tx.insert(linkTable(table)).values(toAdd.map((tagId) =>
          table === 'dishes' ? { dishId: id, tagId } : { ingredientId: id, tagId }));
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save failed';
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : '';
    return { error: cause || msg };
  }
  revalidatePath(`/${table}/${id}`);
  return {};
}
