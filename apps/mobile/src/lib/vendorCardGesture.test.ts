import { isVendorCardTap, shouldDismissVendorCard } from './vendorCardGesture';

describe('vendor card gesture classification', () => {
  it('treats movement inside the 8-point tolerance as a tap', () => {
    expect(isVendorCardTap(0, 0)).toBe(true);
    expect(isVendorCardTap(9, 0)).toBe(false);
  });

  it('dismisses on sufficient downward distance or velocity', () => {
    expect(shouldDismissVendorCard(96, 0.1)).toBe(true);
    expect(shouldDismissVendorCard(20, 0.8)).toBe(true);
  });

  it('keeps short and upward drags open', () => {
    expect(shouldDismissVendorCard(40, 0.2)).toBe(false);
    expect(shouldDismissVendorCard(-120, -1)).toBe(false);
  });
});
