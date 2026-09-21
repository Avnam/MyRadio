import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as stationsDb from '../js/core/stations-db.js';

beforeEach(() => localStorage.clear());

test('starts empty on first open (C-1)', () => {
  assert.equal(stationsDb.isEmpty(), true);
  assert.deepEqual(stationsDb.getStations(), []);
});

test('default country is Israel until set (C-10c)', () => {
  assert.equal(stationsDb.getDefaultCountry(), 'IL');
  stationsDb.setDefaultCountry('US');
  assert.equal(stationsDb.getDefaultCountry(), 'US');
});

test('addStation adds a new station', () => {
  const result = stationsDb.addStation({ name: 'Kan Bet', urls: ['https://a.example/stream'] });
  assert.equal(result.added, true);
  assert.equal(stationsDb.getStations().length, 1);
});

test('adding a station with an already-used stream URL does nothing but say so (decision #3, C-8)', () => {
  stationsDb.addStation({ name: 'Kan Bet', urls: ['https://a.example/stream'] });
  const result = stationsDb.addStation({ name: 'Kan Bet (mirror)', urls: ['https://a.example/stream'] });
  assert.equal(result.added, false);
  assert.equal(stationsDb.getStations().length, 1);
});

test('dedupe matches on any shared URL, not just an exact list match', () => {
  stationsDb.addStation({ name: 'A', urls: ['https://a.example/1', 'https://a.example/2'] });
  const result = stationsDb.addStation({ name: 'A (backup)', urls: ['https://a.example/2', 'https://a.example/3'] });
  assert.equal(result.added, false);
});

test('removeStation removes one station at a time (C-3)', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  stationsDb.addStation({ name: 'B', urls: ['https://b.example'] });
  stationsDb.removeStation(a.id);
  const names = stationsDb.getStations().map(s => s.name);
  assert.deepEqual(names, ['B']);
});

test('removeStation clears lastStationId when it was the removed station', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  stationsDb.setLastStationId(a.id);
  stationsDb.removeStation(a.id);
  assert.equal(stationsDb.getLastStationId(), null);
});

test('removeAll clears every station and the last-played pointer (C-3)', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  stationsDb.addStation({ name: 'B', urls: ['https://b.example'] });
  stationsDb.setLastStationId(a.id);
  stationsDb.removeAll();
  assert.deepEqual(stationsDb.getStations(), []);
  assert.equal(stationsDb.getLastStationId(), null);
});

test('reorder applies a new order when it matches the full station set', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  const { station: b } = stationsDb.addStation({ name: 'B', urls: ['https://b.example'] });
  stationsDb.reorder([b.id, a.id]);
  assert.deepEqual(stationsDb.getStations().map(s => s.id), [b.id, a.id]);
});

test('reorder is ignored when the id list does not cover every station', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  const { station: b } = stationsDb.addStation({ name: 'B', urls: ['https://b.example'] });
  stationsDb.reorder([b.id]); // missing a
  assert.deepEqual(stationsDb.getStations().map(s => s.id), [a.id, b.id]);
});

test('next/previous wrap around the list (C-4)', () => {
  const { station: a } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  const { station: b } = stationsDb.addStation({ name: 'B', urls: ['https://b.example'] });
  const { station: c } = stationsDb.addStation({ name: 'C', urls: ['https://c.example'] });

  assert.equal(stationsDb.next(c.id).id, a.id, 'next on the last station goes to the first');
  assert.equal(stationsDb.previous(a.id).id, c.id, 'previous on the first goes to the last');
  assert.equal(stationsDb.next(a.id).id, b.id);
});

test('next/previous return null when the list is empty', () => {
  assert.equal(stationsDb.next('anything'), null);
  assert.equal(stationsDb.previous('anything'), null);
});
