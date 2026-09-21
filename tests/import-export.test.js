import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as stationsDb from '../js/core/stations-db.js';
import * as importExport from '../js/core/import-export.js';

beforeEach(() => localStorage.clear());

test('rejects invalid JSON with a message saying what is wrong (C-9)', () => {
  assert.throws(() => importExport.parseImportText('{not json'), (e) => e.message === 'invalidJson');
});

test('rejects a file with no stations (C-9)', () => {
  assert.throws(() => importExport.parseImportText('{}'), (e) => e.message === 'noStations');
  assert.throws(() => importExport.parseImportText('[]'), (e) => e.message === 'noStations');
  assert.throws(() => importExport.parseImportText('{"stations": []}'), (e) => e.message === 'noStations');
});

test('accepts a bare list of stations (no wrapper object)', () => {
  const text = JSON.stringify([{ name: 'A', urls: ['https://a.example'] }]);
  const parsed = importExport.parseImportText(text);
  assert.equal(parsed.stations.length, 1);
  assert.equal(parsed.defaultCountry, null);
});

test('accepts the full export shape, including defaultCountry', () => {
  const text = JSON.stringify({
    format: 'radio-stations', version: 1, defaultCountry: 'US',
    stations: [{ name: 'A', urls: ['https://a.example'] }]
  });
  const parsed = importExport.parseImportText(text);
  assert.equal(parsed.defaultCountry, 'US');
});

test('add mode skips stations whose stream URL is already present (C-8)', () => {
  stationsDb.addStation({ name: 'Existing', urls: ['https://a.example'] });
  const parsed = importExport.parseImportText(JSON.stringify([
    { name: 'Existing (dup)', urls: ['https://a.example'] },
    { name: 'New', urls: ['https://b.example'] }
  ]));
  const result = importExport.applyImport(parsed, 'add');
  assert.deepEqual(result, { added: 1, skipped: 1 });
  assert.equal(stationsDb.getStations().length, 2);
});

test('replace mode clears the existing list first (C-8)', () => {
  stationsDb.addStation({ name: 'Old', urls: ['https://old.example'] });
  const parsed = importExport.parseImportText(JSON.stringify([
    { name: 'New', urls: ['https://new.example'] }
  ]));
  importExport.applyImport(parsed, 'replace');
  const names = stationsDb.getStations().map(s => s.name);
  assert.deepEqual(names, ['New']);
});

test('leaves the current list untouched when import is invalid (C-9)', () => {
  stationsDb.addStation({ name: 'Existing', urls: ['https://a.example'] });
  assert.throws(() => importExport.parseImportText('not json at all'));
  assert.equal(stationsDb.getStations().length, 1);
});

test('exportData never includes the last station played (C-2)', () => {
  const { station } = stationsDb.addStation({ name: 'A', urls: ['https://a.example'] });
  stationsDb.setLastStationId(station.id);
  const data = importExport.exportData();
  assert.equal('lastStationId' in data, false);
  assert.equal(data.stations.length, 1);
  assert.equal(data.defaultCountry, stationsDb.getDefaultCountry());
});
