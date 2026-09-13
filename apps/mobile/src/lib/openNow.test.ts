import { isOpenNow } from './openNow';

const hours = {
  mon: [{ open: '09:00', close: '15:00' }],
  fri: [{ open: '18:00', close: '02:00' }], // overnight
  sun: [],                                   // explicitly closed
};

// Date helpers: 2026-07-06 is a Monday.
const at = (day: number, time: string) => new Date(`2026-07-0${day}T${time}:00`);

describe('isOpenNow()', () => {
  it('open within a normal window', () => {
    expect(isOpenNow(hours, at(6, '12:00'))).toBe(true);   // Mon noon
  });
  it('closed outside the window', () => {
    expect(isOpenNow(hours, at(6, '16:00'))).toBe(false);  // Mon 16:00
  });
  it('closed on an empty day', () => {
    expect(isOpenNow(hours, at(5, '12:00'))).toBe(false);  // Sun
  });
  it('closed on a missing day', () => {
    expect(isOpenNow(hours, at(7, '12:00'))).toBe(false);  // Tue absent
  });
  it('overnight range: open late + open after midnight next day', () => {
    expect(isOpenNow(hours, at(3, '23:30'))).toBe(true);   // Fri 23:30
    expect(isOpenNow(hours, at(4, '01:30'))).toBe(true);   // Sat 01:30 (Fri overnight)
    expect(isOpenNow(hours, at(4, '03:00'))).toBe(false);  // Sat 03:00 — past close
  });
  it('null/undefined hours => false', () => {
    expect(isOpenNow(null, at(6, '12:00'))).toBe(false);
    expect(isOpenNow(undefined, at(6, '12:00'))).toBe(false);
  });
  it('malformed entries are ignored, not thrown on', () => {
    expect(isOpenNow({ mon: 'closed' }, at(6, '12:00'))).toBe(false);
    expect(isOpenNow({ mon: [null, { open: '09:00' }] }, at(6, '12:00'))).toBe(false);
    expect(isOpenNow({ mon: [null, { open: '09:00', close: '15:00' }] }, at(6, '12:00'))).toBe(true);
  });
  it('uses Bangkok time, not the device clock', () => {
    expect(isOpenNow(hours, new Date('2026-07-06T04:00:00Z'))).toBe(true);
    expect(isOpenNow(hours, new Date('2026-07-06T09:00:00Z'))).toBe(false);
  });
});
