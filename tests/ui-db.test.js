import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as uiDb from '../js/core/ui-db.js';

beforeEach(() => localStorage.clear());

test('defaults: English, Evia, no per-look settings yet', () => {
  assert.equal(uiDb.getLanguage(), 'en');
  assert.equal(uiDb.getActiveLook(), 'evia');
  assert.equal(uiDb.getLookSettings('evia'), null);
});

test('language and active look round-trip', () => {
  uiDb.setLanguage('en');
  uiDb.setActiveLook('evia');
  assert.equal(uiDb.getLanguage(), 'en');
  assert.equal(uiDb.getActiveLook(), 'evia');
});

test('each look keeps its own settings section, never mixed (C-16)', () => {
  uiDb.setLookSettings('evia', { accent: 'blue' });
  uiDb.setLookSettings('another-look', { accent: 'green' });
  assert.deepEqual(uiDb.getLookSettings('evia'), { accent: 'blue' });
  assert.deepEqual(uiDb.getLookSettings('another-look'), { accent: 'green' });
});

test('switching the active look does not touch any look\'s settings', () => {
  uiDb.setLookSettings('evia', { accent: 'blue' });
  uiDb.setActiveLook('another-look');
  assert.deepEqual(uiDb.getLookSettings('evia'), { accent: 'blue' });
});
