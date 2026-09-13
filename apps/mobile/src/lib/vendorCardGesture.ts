export const VENDOR_CARD_TAP_SLOP = 8;
export const VENDOR_CARD_DISMISS_DISTANCE = 96;
export const VENDOR_CARD_DISMISS_VELOCITY = 0.8;

export function isVendorCardTap(dx: number, dy: number): boolean {
  return Math.abs(dx) <= VENDOR_CARD_TAP_SLOP && Math.abs(dy) <= VENDOR_CARD_TAP_SLOP;
}

export function shouldDismissVendorCard(dy: number, vy: number): boolean {
  return dy >= VENDOR_CARD_DISMISS_DISTANCE
    || (dy > 0 && vy >= VENDOR_CARD_DISMISS_VELOCITY);
}
