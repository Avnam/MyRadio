// UI database: language, active look, per-look settings. Never exported.
// Every look must read/write ITS section only through getLookSettings/setLookSettings —
// no look should touch localStorage directly, so switching looks can never mix state.

const KEY = 'radio.ui';
const VERSION = 1;

function defaults() {
  return {
    version: VERSION,
    language: 'en',
    activeLook: 'evia',
    looks: {}
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
    activeLook: typeof raw.activeLook === 'string' ? raw.activeLook : 'evia',
    looks: (raw.looks && typeof raw.looks === 'object') ? raw.looks : {}
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

export function getActiveLook() {
  return load().activeLook;
}

export function setActiveLook(id) {
  const state = load();
  state.activeLook = id;
  save(state);
}

export function getLookSettings(lookId) {
  const state = load();
  return state.looks[lookId] ?? null;
}

export function setLookSettings(lookId, settings) {
  const state = load();
  state.looks[lookId] = settings;
  save(state);
}
