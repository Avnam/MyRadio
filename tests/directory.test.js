import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as directory from '../js/core/directory.js';

const stations = [
  { name: 'Galgalatz', tags: ['pop', 'rock'], city: 'Tel Aviv' },
  { name: 'Kan Bet', tags: ['news', 'talk'], city: 'Jerusalem' },
  { name: 'Eco 99FM', tags: ['hits'], city: 'Tel Aviv' }
];

test('empty pattern returns every station', () => {
  assert.equal(directory.search(stations, '').length, 3);
});

test('filters by name, case-insensitively (C-10d)', () => {
  const result = directory.search(stations, 'galgalatz');
  assert.deepEqual(result.map(s => s.name), ['Galgalatz']);
});

test('filters by tag', () => {
  const result = directory.search(stations, 'rock');
  assert.deepEqual(result.map(s => s.name), ['Galgalatz']);
});

test('filters by city, matching more than one station', () => {
  const result = directory.search(stations, 'tel aviv');
  assert.deepEqual(result.map(s => s.name).sort(), ['Eco 99FM', 'Galgalatz']);
});

test('an invalid pattern throws so the caller can keep the last result (C-10d)', () => {
  assert.throws(() => directory.search(stations, '('));
});
