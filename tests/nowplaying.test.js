import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNowPlaying, sameNowPlayingSource } from '../js/core/nowplaying.js';

const ECO99_SOURCE = {
  program: 'fields.program_name.stringValue',
  artist: 'fields.artist_name.stringValue',
  title: 'fields.song_name.stringValue'
};

const KAN_SOURCE = {
  program: 'programData.programName',
  artist: 'artists',
  title: 'title'
};

// Real payload captured from the Eco 99 Firestore endpoint (22 September 2026).
const ECO99_PAYLOAD = {
  name: 'projects/eco-99-production/databases/(default)/documents/streamed_content/program',
  fields: {
    song_name: { stringValue: 'Crazy' },
    program_name: { stringValue: 'מוזיקה מעולה כל הלילה' },
    image_url: { stringValue: 'https://eco99fm.maariv.co.il/download/radio/place_holder2_copy_186.jpg' },
    artist_name: { stringValue: 'Seal' },
    broadcaster_name: { stringValue: '' }
  }
};

// Real payload captured from Kan's API (22 September 2026).
const KAN_PAYLOAD = {
  title: 'Losing My Religion',
  artists: ['R.E.M.'],
  startTime: '2026-09-22T08:17:03Z',
  endTime: '2026-09-22T08:21:30Z',
  delayTime: 5000,
  programData: { programName: 'טל ארגמן', programLink: '/content/kan/kan-88/p-686173/' }
};

test('extracts program/artist/title from the real Eco 99 payload shape', () => {
  assert.deepEqual(extractNowPlaying(ECO99_SOURCE, ECO99_PAYLOAD), {
    program: 'מוזיקה מעולה כל הלילה',
    artist: 'Seal',
    title: 'Crazy'
  });
});

test('extracts from the real Kan payload shape, joining the artists array', () => {
  assert.deepEqual(extractNowPlaying(KAN_SOURCE, KAN_PAYLOAD), {
    program: 'טל ארגמן',
    artist: 'R.E.M.',
    title: 'Losing My Religion'
  });
});

test('joins a multi-artist array with commas', () => {
  const payload = { title: 'Song', artists: ['Artist A', 'Artist B'], programData: { programName: 'Show' } };
  assert.deepEqual(extractNowPlaying(KAN_SOURCE, payload).artist, 'Artist A, Artist B');
});

test('returns null for an empty response (e.g. Kan\'s 204 between songs)', () => {
  assert.equal(extractNowPlaying(KAN_SOURCE, null), null);
});

test('returns null when every field is missing, rather than an all-empty object', () => {
  assert.equal(extractNowPlaying(KAN_SOURCE, { somethingElse: true }), null);
});

test('sameNowPlayingSource treats identical values as the same regardless of key order', () => {
  const a = { url: 'https://x', program: 'p', artist: 'a', title: 't', refresh: 20 };
  const b = { refresh: 20, title: 't', artist: 'a', program: 'p', url: 'https://x' };
  assert.equal(sameNowPlayingSource(a, b), true);
});

test('sameNowPlayingSource detects an actual field difference', () => {
  const a = { url: 'https://x', program: 'p', artist: 'a', title: 't', refresh: 20 };
  const b = { url: 'https://x-fixed', program: 'p', artist: 'a', title: 't', refresh: 20 };
  assert.equal(sameNowPlayingSource(a, b), false);
});

test('sameNowPlayingSource treats one missing/null source as different', () => {
  const a = { url: 'https://x', program: 'p', artist: 'a', title: 't', refresh: 20 };
  assert.equal(sameNowPlayingSource(a, null), false);
  assert.equal(sameNowPlayingSource(null, a), false);
  assert.equal(sameNowPlayingSource(null, null), true);
});
