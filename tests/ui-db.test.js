import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as uiDb from '../js/core/ui-db.js';

beforeEach(() => localStorage.clear());

test('defaults: English, Evia, no per-theme settings yet', () => {
  assert.equal(uiDb.getLanguage(), 'en');
  assert.equal(uiDb.getActiveTheme(), 'evia');
  assert.equal(uiDb.getThemeSettings('evia'), null);
});

test('language and active theme round-trip', () => {
  uiDb.setLanguage('en');
  uiDb.setActiveTheme('evia');
  assert.equal(uiDb.getLanguage(), 'en');
  assert.equal(uiDb.getActiveTheme(), 'evia');
});

test('each theme keeps its own settings section, never mixed (C-16)', () => {
  uiDb.setThemeSettings('evia', { accent: 'blue' });
  uiDb.setThemeSettings('another-theme', { accent: 'green' });
  assert.deepEqual(uiDb.getThemeSettings('evia'), { accent: 'blue' });
  assert.deepEqual(uiDb.getThemeSettings('another-theme'), { accent: 'green' });
});

test('switching the active theme does not touch any theme\'s settings', () => {
  uiDb.setThemeSettings('evia', { accent: 'blue' });
  uiDb.setActiveTheme('another-theme');
  assert.deepEqual(uiDb.getThemeSettings('evia'), { accent: 'blue' });
});
