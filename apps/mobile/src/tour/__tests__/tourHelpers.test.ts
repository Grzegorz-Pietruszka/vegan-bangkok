import type { RouteStep } from '@vegan-bangkok/schemas';
import { TOUR_PRESETS } from '../presets';
import { tourMeta, formatTourMeta } from '../meta';
import { routeToLineString, boundsOf } from '../geo';
import { setCurrentRoute, getCurrentRoute } from '../currentRoute';

const step = (o: Partial<RouteStep>): RouteStep => ({
  type: 'place', id: '00000000-0000-4000-8000-00000000000' + ((o.order ?? 0) + 1),
  name: 'Stop', nameTh: null, lat: 13.75, lng: 100.49, order: 0, summary: null,
  walkMetersFromPrev: 0, ...o,
});

const STEPS: RouteStep[] = [
  step({ order: 0, type: 'site', lat: 13.75, lng: 100.49, walkMetersFromPrev: 100 }),
  step({ order: 1, type: 'place', lat: 13.76, lng: 100.50, walkMetersFromPrev: 2100 }),
  step({ order: 2, type: 'dish', lat: 13.74, lng: 100.51, walkMetersFromPrev: 1800 }),
];

test('five presets, ids match the server set', () => {
  expect(TOUR_PRESETS.map((p) => p.id)).toEqual(
    ['romantic-dinner', 'night-walk', 'street-food-crawl', 'temple-and-lunch', 'sunset']);
});

test('tourMeta: km sums walk legs; hours = walk at 4km/h + 45min per food stop', () => {
  const m = tourMeta(STEPS);
  expect(m.stops).toBe(3);
  expect(m.km).toBeCloseTo(4.0, 5);           // (100+2100+1800)/1000
  // walk 4km/4kmh = 1h; food stops = place + dish = 2 × 0.75h = 1.5h → 2.5h
  expect(m.hours).toBeCloseTo(2.5, 5);
  expect(formatTourMeta(STEPS)).toBe('3 stops · 4.0 km · ~2.5 h');
});

test('routeToLineString emits [lng,lat] coords in step order', () => {
  const ls = routeToLineString(STEPS);
  expect(ls.geometry.coordinates).toEqual([
    [100.49, 13.75], [100.50, 13.76], [100.51, 13.74]]);
});

test('boundsOf returns SW/NE corners', () => {
  expect(boundsOf(STEPS)).toEqual({ sw: [100.49, 13.74], ne: [100.51, 13.76] });
});

test('currentRoute store round-trips and clears', () => {
  const route = { steps: STEPS, narrative: 'hi' };
  setCurrentRoute(route);
  expect(getCurrentRoute()).toBe(route);
  setCurrentRoute(null);
  expect(getCurrentRoute()).toBeNull();
});
