import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMapConfig, DEFAULT_STYLE_URL } from '../src/map/mapConfig.ts';

test('accepts a public pk. token', () => {
  assert.equal(resolveMapConfig({ mapboxToken: 'pk.eyJtest' }).accessToken, 'pk.eyJtest');
});
test('rejects a secret sk. token', () => {
  assert.throws(() => resolveMapConfig({ mapboxToken: 'sk.eyJsecret' }), /PUBLIC pk/);
});
test('throws when the token is missing', () => {
  assert.throws(() => resolveMapConfig({}), /Missing Mapbox public token/);
});
test('falls back to the default style until the cream style URL is set', () => {
  const c = resolveMapConfig({ mapboxToken: 'pk.x' });
  assert.equal(c.styleURL, DEFAULT_STYLE_URL);
  assert.equal(c.usingFallbackStyle, true);
});
test('uses the custom cream style when provided (decision a)', () => {
  const c = resolveMapConfig({ mapboxToken: 'pk.x', mapboxStyleUrl: 'mapbox://styles/veganbkk/cream' });
  assert.equal(c.styleURL, 'mapbox://styles/veganbkk/cream');
  assert.equal(c.usingFallbackStyle, false);
});
