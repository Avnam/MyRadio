// Evia owns the skip-in-next/previous policy (not core — see stations-db.test.js)
// and the lock-screen wording (not core — see app.js's defaultMediaMetadata
// fallback), so both are tested here against the theme module directly. Only
// the pure exported functions are touched; mount() (DOM) is never called.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as stationsDb from '../js/core/stations-db.js';
import * as evia from '../themes/evia/evia.js';

beforeEach(() => localStorage.clear());

test('getNextStation/getPreviousStation pass over stations marked skippable', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  const { station: b } = stationsDb.addStation({ name: 'B', urls: ['https://b.example'] });
  const { station: c } = stationsDb.addStation({ name: 'C', urls: ['https://c.example'] });
  stationsDb.setSkippable(b.id, true);

  assert.equal(evia.getNextStation(a.id).id, c.id, 'skips B and lands on C');
  assert.equal(evia.getPreviousStation(c.id).id, a.id, 'skips B going backwards too');
});

test('getNextStation/getPreviousStation stay put when every other station is skippable', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  const { station: b } = stationsDb.addStation({ name: 'B', urls: ['https://b.example'] });
  stationsDb.setSkippable(b.id, true);

  assert.equal(evia.getNextStation(a.id).id, a.id);
  assert.equal(evia.getPreviousStation(a.id).id, a.id);
});

test('does not skip when nothing is marked skippable (matches core C-4 wraparound)', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  const { station: b } = stationsDb.addStation({ name: 'B', urls: ['https://b.example'] });
  const { station: c } = stationsDb.addStation({ name: 'C', urls: ['https://c.example'] });

  assert.equal(evia.getNextStation(c.id).id, a.id);
  assert.equal(evia.getPreviousStation(a.id).id, c.id);
  assert.equal(evia.getNextStation(a.id).id, b.id);
});

test('getMediaMetadata: just the station name when there is no now-playing data (E-9)', () => {
  const station = { name: 'Eco 99FM' };
  assert.deepEqual(evia.getMediaMetadata(station, null), { title: 'Eco 99FM', artist: 'Live radio' });
});

test('getMediaMetadata: packs program into title, artist+title into artist, once known', () => {
  const station = { name: 'Eco 99FM' };
  const nowPlaying = { program: 'מוזיקה מעולה כל היום', artist: 'Taylor Swift', title: 'The Fate of Ophelia' };
  assert.deepEqual(evia.getMediaMetadata(station, nowPlaying), {
    title: 'Eco 99FM -- מוזיקה מעולה כל היום',
    artist: 'Taylor Swift - The Fate of Ophelia'
  });
});

test('getMediaMetadata: falls back sensibly when only one of artist/title is known', () => {
  const station = { name: 'Eco 99FM' };
  assert.deepEqual(evia.getMediaMetadata(station, { program: null, artist: 'Taylor Swift', title: null }).artist, 'Taylor Swift');
  assert.deepEqual(evia.getMediaMetadata(station, { program: null, artist: null, title: 'The Fate of Ophelia' }).artist, 'The Fate of Ophelia');
});
