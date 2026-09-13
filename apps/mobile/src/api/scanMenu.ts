import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { scanMenuResponse, type MenuScanItem } from '@vegan-bangkok/schemas';
import { API_BASE, HttpError } from './base';

// Upload one still menu photo → server-side OCR + database-first matching (plan 11).
// Uses expo-file-system's uploadAsync (MULTIPART) rather than fetch+FormData: under RN 0.86 /
// New Architecture, a fetch FormData part shaped { uri, name, type } is rejected with
// "Unsupported FormDataPart implementation". uploadAsync streams the local file URI as a proper
// multipart/form-data part that @fastify/multipart parses, and has no default timeout — right
// for a slow OCR endpoint (a full menu photo takes ~20s).
export async function uploadMenuPhoto(uri: string): Promise<MenuScanItem[]> {
  const res = await uploadAsync(`${API_BASE}/scan-menu`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'photo',          // matches req.file() field in src/routes/scanMenu.ts
    mimeType: 'image/jpeg',      // picker uses quality<1 → JPEG re-encode on iOS
  });
  if (res.status !== 200) {
    let body: unknown;
    try { body = JSON.parse(res.body); } catch { /* non-JSON error body — status alone is enough */ }
    throw new HttpError(res.status, body);
  }
  return scanMenuResponse.parse(JSON.parse(res.body)).items;
}
