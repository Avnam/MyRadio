// UI database: language, active theme, per-theme settings. Never exported.
// Every theme must read/write ITS section only through getThemeSettings/setThemeSettings —
// no theme should touch localStorage directly, so switching themes can never mix state.

const KEY = 'radio.ui';
const VERSION = 1;

function defaults() {
  return {
    version: VERSION,
    language: 'en',
    activeTheme: 'evia',
    themes: {}
  };
}

function load() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(KEY));
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') return defaults();
  return {
    version: VERSION,
    language: typeof raw.language === 'string' ? raw.language : 'en',
    activeTheme: typeof raw.activeTheme === 'string' ? raw.activeTheme : 'evia',
    themes: (raw.themes && typeof raw.themes === 'object') ? raw.themes : {}
  };
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getLanguage() {
  return load().language;
}

export function setLanguage(code) {
  const state = load();
  state.language = code;
  save(state);
}

export function getActiveTheme() {
  return load().activeTheme;
}

export function setActiveTheme(id) {
  const state = load();
  state.activeTheme = id;
  save(state);
}

export function getThemeSettings(themeId) {
  const state = load();
  return state.themes[themeId] ?? null;
}

export function setThemeSettings(themeId, settings) {
  const state = load();
  state.themes[themeId] = settings;
  save(state);
}
