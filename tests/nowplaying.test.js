import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNowPlaying } from '../js/core/nowplaying.js';
import { findNowPlayingSource } from '../js/core/nowplaying-sources.js';

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

test('findNowPlayingSource matches a station by any of its stream URLs', () => {
  const eco99 = { urls: ['https://eco-live.mediacast.co.il/99fm_aac'] };
  const source = findNowPlayingSource(eco99);
  assert.ok(source);
  assert.equal(source.program, 'fields.program_name.stringValue');
});

test('findNowPlayingSource returns null for a station with no known source', () => {
  const unknown = { urls: ['https://example.com/stream.mp3'] };
  assert.equal(findNowPlayingSource(unknown), null);
});
