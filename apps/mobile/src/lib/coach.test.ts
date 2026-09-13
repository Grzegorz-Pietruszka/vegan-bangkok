import { coachLines } from './coach';

const somTam = {
  nameEn: 'Som tam', nameTh: 'ส้มตำ', orderPhrase: 'som tam jay',
  skipIngredients: 'fish sauce, dried shrimp, crab',
};

describe('coachLines()', () => {
  it('builds the say-line from the order phrase', () => {
    const { say } = coachLines(somTam);
    expect(say?.roman).toBe('som tam jay');
  });
  it('maps known skip ingredients to Thai exclusion lines with English gloss', () => {
    const { avoid } = coachLines(somTam);
    expect(avoid).toHaveLength(3);
    expect(avoid[0]).toEqual({ thai: 'ไม่ใส่น้ำปลา', english: 'no fish sauce' });
    expect(avoid[1].english).toBe('no dried shrimp');
    expect(avoid[2].thai).toBe('ไม่ใส่ปู');
  });
  it('unknown ingredient degrades to English-only (never invents Thai)', () => {
    const { avoid } = coachLines({ ...somTam, skipIngredients: 'mystery goo' });
    expect(avoid).toEqual([{ thai: null, english: 'no mystery goo' }]);
  });
  it('handles null skipIngredients and null orderPhrase', () => {
    const c = coachLines({ nameEn: 'X', nameTh: null, orderPhrase: null, skipIngredients: null });
    expect(c.say).toBeNull();
    expect(c.avoid).toEqual([]);
  });
});
