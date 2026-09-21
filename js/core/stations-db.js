// Stations database: your station list, default country, last station played.
// The last station played is local-only and is stripped out by import-export.js.
// This is the ONLY module allowed to touch the 'radio.stations' key.

const KEY = 'radio.stations';
const VERSION = 1;

function defaults() {
  return {
    version: VERSION,
    defaultCountry: 'IL',
    lastStationId: null,
    stations: []
  };
}

function load() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(KEY));
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.stations)) return defaults();
  return {
    version: VERSION,
    defaultCountry: typeof raw.defaultCountry === 'string' ? raw.defaultCountry : 'IL',
    lastStationId: typeof raw.lastStationId === 'string' ? raw.lastStationId : null,
    stations: raw.stations
  };
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function makeId() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2));
}

function sharesUrl(a, b) {
  return a.urls.some(u => b.urls.includes(u));
}

export function getStations() {
  return load().stations;
}

export function getStation(id) {
  return load().stations.find(s => s.id === id) ?? null;
}

export function isEmpty() {
  return load().stations.length === 0;
}

/**
 * Adds a station unless a station with an overlapping stream URL already exists.
 * Returns { added: boolean, station }.
 */
export function addStation(input) {
  const state = load();
  const candidate = {
    id: makeId(),
    name: input.name,
    urls: input.urls,
    country: input.country ?? state.defaultCountry,
    tags: input.tags ?? [],
    logo: input.logo ?? null
  };
  const existing = state.stations.find(s => sharesUrl(s, candidate));
  if (existing) return { added: false, station: existing };
  state.stations.push(candidate);
  save(state);
  return { added: true, station: candidate };
}

export function removeStation(id) {
  const state = load();
  state.stations = state.stations.filter(s => s.id !== id);
  if (state.lastStationId === id) state.lastStationId = null;
  save(state);
}

export function removeAll() {
  const state = load();
  state.stations = [];
  state.lastStationId = null;
  save(state);
}

/** Reorders the list to match the given array of station ids. */
export function reorder(idsInOrder) {
  const state = load();
  const byId = new Map(state.stations.map(s => [s.id, s]));
  const next = idsInOrder.map(id => byId.get(id)).filter(Boolean);
  if (next.length === state.stations.length) {
    state.stations = next;
    save(state);
  }
}

export function getDefaultCountry() {
  return load().defaultCountry;
}

export function setDefaultCountry(code) {
  const state = load();
  state.defaultCountry = code;
  save(state);
}

export function getLastStationId() {
  return load().lastStationId;
}

export function setLastStationId(id) {
  const state = load();
  state.lastStationId = id;
  save(state);
}

function stepStation(currentId, delta) {
  const state = load();
  const n = state.stations.length;
  if (n === 0) return null;
  const idx = state.stations.findIndex(s => s.id === currentId);
  const from = idx === -1 ? 0 : idx;
  const nextIdx = ((from + delta) % n + n) % n;
  return state.stations[nextIdx];
}

/** Next station, wrapping from the last back to the first (C-4). */
export function next(currentId) {
  return stepStation(currentId, 1);
}

/** Previous station, wrapping from the first back to the last (C-4). */
export function previous(currentId) {
  return stepStation(currentId, -1);
}
