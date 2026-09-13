import Constants from 'expo-constants';

// Single source for the API origin — was duplicated verbatim in searchDishes/scanMenu.
// EXPO_PUBLIC_API_URL (from the gitignored .env.local) wins, so a dev pointing a phone at
// a LAN address never has to edit — and accidentally commit — app.json.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  'http://localhost:3000';

// Every API module throws this on a non-2xx so normalizeError can map status → user
// message without parsing "x failed: 500" strings. body carries the parsed JSON error
// payload when one exists (field errors for 400/422) — never shown to the user raw.
export class HttpError extends Error {
  constructor(public status: number, public body?: unknown) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
  }
}
