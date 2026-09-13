import { typography } from './typography';

describe('typography()', () => {
  it('thai variant uses a Noto Sans Thai family at 44/52', () => {
    const s = typography('vendorNameThai', 'thai');
    expect(String(s.fontFamily)).toMatch(/NotoSansThai/);
    expect(s.fontSize).toBe(44);
    expect(s.lineHeight).toBe(52);
  });
  it('latin body uses a Poppins family at 16/24', () => {
    const s = typography('body', 'latin');
    expect(String(s.fontFamily)).toMatch(/Poppins/);
    expect(s.fontSize).toBe(16);
    expect(s.lineHeight).toBe(24);
  });
  it('zeroes Latin tracking for Thai but keeps it for Latin (exercises the script branch)', () => {
    // Assert on h1 (base letterSpacing -0.2), NOT vendorNameThai (base 0): a 0-tracking
    // variant stays green even if the `script === 'thai' ? 0 : v.letterSpacing` branch is
    // deleted, so it proves nothing. h1 forces the branch to actually fire.
    expect(typography('h1', 'thai').letterSpacing).toBe(0);
    expect(typography('h1', 'latin').letterSpacing).toBe(-0.2);
  });
  it('never sets fontWeight (weight is baked into the family — the no-faux-bold invariant)', () => {
    expect(typography('h1', 'latin').fontWeight).toBeUndefined();
    expect(typography('vendorNameThai', 'thai').fontWeight).toBeUndefined();
  });
});
