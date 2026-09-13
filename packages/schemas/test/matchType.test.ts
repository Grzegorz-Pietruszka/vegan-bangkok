import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchResponse } from '../src/domain.ts';

describe('searchResponse matchType', () => {
  it('accepts { results: [], matchType: "name" }', () => {
    const result = searchResponse.safeParse({ results: [], matchType: 'name' });
    assert.ok(result.success);
  });
  it('accepts { results: [], matchType: "semantic" }', () => {
    const result = searchResponse.safeParse({ results: [], matchType: 'semantic' });
    assert.ok(result.success);
  });
  it('accepts { results: [], matchType: "keyword" }', () => {
    const result = searchResponse.safeParse({ results: [], matchType: 'keyword' });
    assert.ok(result.success);
  });
  it('rejects { results: [], matchType: "fuzzy" }', () => {
    const result = searchResponse.safeParse({ results: [], matchType: 'fuzzy' });
    assert.ok(!result.success);
  });
  it('accepts { results: [] } without matchType (backward compat)', () => {
    const result = searchResponse.safeParse({ results: [] });
    assert.ok(result.success);
  });
});
