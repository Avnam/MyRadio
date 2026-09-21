import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as i18n from '../js/core/i18n.js';

test('falls back to the key itself before any language is loaded', () => {
  assert.equal(i18n.t('some.missing.key'), 'some.missing.key');
});

test('loads a language file and substitutes {param} placeholders (C-10e)', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ strings: { 'greeting.hello': 'Hello {name}' } })
  });
  try {
    await i18n.loadLanguage('en');
    assert.equal(i18n.t('greeting.hello', { name: 'World' }), 'Hello World');
  } finally {
    globalThis.fetch = realFetch;
  }
});
