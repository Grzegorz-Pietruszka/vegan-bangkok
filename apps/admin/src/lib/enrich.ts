'use server';
// Cross-app source import (Task 8 pattern, same as termActions.ts → normalize.ts):
// resolves and runs fine under Turbopack; enrich-places.ts keeps its module scope
// side-effect free so importing it never parses argv or hits the network.
import { enrichPlaceById } from '../../../api/scripts/enrich-places.ts';
import { revalidatePath } from 'next/cache';

export async function reenrich(id: string): Promise<{ error?: string }> {
  try {
    await enrichPlaceById(id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'enrich failed' };
  }
  revalidatePath(`/places/${id}`);
  return {};
}
