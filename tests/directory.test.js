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

test('mergeNowPlaying matches ignoring the query string, since Radio Browser can add one (C-14)', () => {
  const withUrls = [
    { name: 'Eco 99FM', urls: ['https://eco01.example/stream?hash=abc123'] },
    { name: 'Galgalatz', urls: ['https://glz.example/stream'] }
  ];
  // Keyed by the canonical URL, with no query string — as directory/<CODE>_metadata.json is authored.
  const nowPlayingMap = {
    'https://eco01.example/stream': { url: 'https://api.example/np', program: 'p', artist: 'a', title: 't' }
  };
  const merged = directory.mergeNowPlaying(withUrls, nowPlayingMap);
  assert.deepEqual(merged[0].nowPlaying, nowPlayingMap['https://eco01.example/stream']);
  assert.equal('nowPlaying' in merged[1], false);
});

test('mergeNowPlaying leaves stations untouched when the map is empty or missing', () => {
  const withUrls = [{ name: 'A', urls: ['https://a.example'] }];
  assert.deepEqual(directory.mergeNowPlaying(withUrls, null), withUrls);
  assert.deepEqual(directory.mergeNowPlaying(withUrls, {}), withUrls);
});
