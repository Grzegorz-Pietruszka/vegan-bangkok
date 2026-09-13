import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderRoute } from '../../src/itinerary/route.ts';

// 4 nodes, symmetric. All 6 permutations from node 0 hand-enumerated:
// 0-1-2-3=37 (optimum), 0-1-3-2=62, 0-2-1-3=105, 0-2-3-1=102, 0-3-1-2=100, 0-3-2-1=72.
const INF = Infinity;
const M4 = [
  [INF, 10, 50, 45],
  [10, INF, 15, 40],
  [50, 15, INF, 12],
  [45, 40, 12, INF],
];

test('Held-Karp returns the hand-computed optimal order', () => {
  assert.deepEqual(orderRoute(M4, { startIdx: 0, maxStops: 3 }), [0, 1, 2, 3]);
});

test('maxStops picks the best subset of the right size, start always first', () => {
  // pairs: {1,2}→0-1-2=25 (best), {1,3}→50 via 0-1-3, {2,3}→57 via 0-3-2
  assert.deepEqual(orderRoute(M4, { startIdx: 0, maxStops: 2 }), [0, 1, 2]);
});

test('mustInclude survives subset selection', () => {
  // best pair containing 3 is {1,3}: 0-1-3 = 50
  const r = orderRoute(M4, { startIdx: 0, maxStops: 2, mustInclude: [3] });
  assert.deepEqual(r, [0, 1, 3]);
});

test('slot ranks force exact sequence even when costlier', () => {
  // without slots best is 0-1-2 (5+100); node 1 is dessert (rank 2), node 2 main (rank 1)
  // → dessert cannot precede main, forced 0-2-1 (100+100)
  const m = [
    [INF, 5, 100],
    [5, INF, 100],
    [100, 100, INF],
  ];
  const r = orderRoute(m, { startIdx: 0, maxStops: 2, slotRanks: [null, 2, 1] });
  assert.deepEqual(r, [0, 2, 1]);
});

test('sunset stop lands in the evening position (slot sequence asserted)', () => {
  // 0=start, 1=daytime(0), 2=sunset(1), 3=evening food(2) — geometry tempts 0-3-2-1
  const m = [
    [INF, 90, 60, 5],
    [90, INF, 30, 80],
    [60, 30, INF, 20],
    [5, 80, 20, INF],
  ];
  const r = orderRoute(m, { startIdx: 0, maxStops: 3, slotRanks: [null, 0, 1, 2] });
  assert.deepEqual(r, [0, 1, 2, 3]);
});

test('n above Held-Karp threshold uses greedy+2-opt and stays valid', () => {
  // 20 nodes on a line: node i at position i → distance |i−j|×10
  const n = 20;
  const m = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? INF : Math.abs(i - j) * 10)));
  const r = orderRoute(m, { startIdx: 0, maxStops: 5, mustInclude: [19] });
  assert.equal(r[0], 0);
  assert.equal(r.length, 6); // start + maxStops
  assert.ok(r.includes(19), 'must-include dropped');
  assert.equal(new Set(r).size, r.length, 'revisited a node');
});

test('mustInclude larger than maxStops throws', () => {
  assert.throws(() => orderRoute(M4, { startIdx: 0, maxStops: 1, mustInclude: [1, 2] }));
});
