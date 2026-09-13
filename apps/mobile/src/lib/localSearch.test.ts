import { filterDishes } from './localSearch';

const dishes = [
  { id: '1', nameEn: 'Som tam', nameTh: 'ส้มตำ', description: 'papaya salad', tags: ['sour', 'salad'], regionName: 'Isaan (northeast)' },
  { id: '2', nameEn: 'Khao soi', nameTh: 'ข้าวซอย', description: 'curry noodle soup', tags: ['soup', 'curry'], regionName: 'Northern Thailand' },
  { id: '3', nameEn: 'Tom kha', nameTh: 'ต้มข่า', description: 'coconut soup', tags: ['soup', 'mild'], regionName: 'Central Thailand' },
] as never[];

describe('filterDishes()', () => {
  it('matches query against nameEn case-insensitively', () => {
    expect(filterDishes(dishes, { q: 'som' })).toHaveLength(1);
  });
  it('matches Thai script', () => {
    expect(filterDishes(dishes, { q: 'ข้าวซอย' })).toHaveLength(1);
  });
  it('matches description words', () => {
    expect(filterDishes(dishes, { q: 'soup' })).toHaveLength(2);
  });
  it('filters by tag', () => {
    expect(filterDishes(dishes, { tag: 'soup' })).toHaveLength(2);
  });
  it('filters by region', () => {
    expect(filterDishes(dishes, { region: 'Northern Thailand' })).toHaveLength(1);
  });
  it('combines query and tag', () => {
    expect(filterDishes(dishes, { q: 'coconut', tag: 'soup' })).toHaveLength(1);
  });
  it('empty filters return everything', () => {
    expect(filterDishes(dishes, {})).toHaveLength(3);
  });
});
