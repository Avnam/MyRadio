// Boots core, then mounts the active theme. Owns the one shared Player instance and
// the Media Session wiring, since both need stations-db + player together, not any
// one theme's markup. Navigation (next/previous) is delegated to the active theme,
// since a theme may define its own policy (e.g. Evia's skippable stations) — core's
// plain stationsDb.next/previous is the fallback for any theme that doesn't.
import * as stationsDb from './core/stations-db.js';
import * as uiDb from './core/ui-db.js';
import * as importExport from './core/import-export.js';
import * as directory from './core/directory.js';
import * as i18n from './core/i18n.js';
import { Player } from './core/player.js';
import { sameNowPlayingSource } from './core/nowplaying.js';
import { THEMES, getTheme } from './core/themes.js';
import { VERSION } from './version.js';

const player = new Player();
let currentCleanup = null;

function activeTheme() {
  return getTheme(uiDb.getActiveTheme());
}

function nextStationFor(currentId) {
  const theme = activeTheme();
  return theme.getNextStation ? theme.getNextStation(currentId) : stationsDb.next(currentId);
}

function previousStationFor(currentId) {
  const theme = activeTheme();
  return theme.getPreviousStation ? theme.getPreviousStation(currentId) : stationsDb.previous(currentId);
}

function selectStation(station, autoplay) {
  stationsDb.setLastStationId(station.id);
  player.load(station, autoplay);
}

// Acts immediately (preserving the click's user-gesture context, which
// autoplay policies care about) — Player itself protects any in-flight,
// not-yet-settled connection attempt from being interrupted, queuing rapid
// requests and applying only the latest once it's safe to. See player.js's
// _busy/_queuedStation.
function goNext() {
  const station = nextStationFor(player.station?.id ?? stationsDb.getLastStationId());
  if (station) selectStation(station, player.playing);
}

function goPrevious() {
  const station = previousStationFor(player.station?.id ?? stationsDb.getLastStationId());
  if (station) selectStation(station, player.playing);
}

/** Removing the current station moves on to the next one, if any remain. */
function removeStation(id) {
  const wasCurrent = player.station?.id === id;
  const wasPlaying = player.playing;
  let target = wasCurrent && stationsDb.getStations().length > 1 ? nextStationFor(id) : null;
  if (target?.id === id) target = null; // no eligible station to move to
  stationsDb.removeStation(id);
  if (wasCurrent) {
    if (target) selectStation(target, wasPlaying);
    else player.load(null, false);
  }
}

function removeAllStations() {
  stationsDb.removeAll();
  player.load(null, false);
}

/**
 * Checks the directory for a fresher now-playing source than what's stored
 * on this station, each time it actually starts a real connection — not just
 * when it was first added. Without this, fixing or adding a source in
 * directory/<CODE>_metadata.json would only ever reach new additions, never
 * a station already sitting in someone's list (C-14). Only updates storage
 * (and shows the status message) on an actual difference — sameNowPlayingSource
 * compares field-by-field, not by JSON string, since a station whose
 * nowPlaying arrived via import can have the same values in a different key
 * order, which used to look like a "change" and fire the message every time.
 */
async function refreshNowPlayingConfig(station) {
  const fresh = await directory.findNowPlayingSource(station.country, station.urls);
  if (!fresh || sameNowPlayingSource(fresh, station.nowPlaying)) return;
  stationsDb.setNowPlaying(station.id, fresh);
  player.setNowPlayingConfig(station.id, fresh);
}

player.addEventListener('state', (e) => {
  if (e.detail.playing && e.detail.station) refreshNowPlayingConfig(e.detail.station);
});

/**
 * Minimal, generic fallback for a theme that doesn't define its own
 * getMediaMetadata(station, nowPlaying) — just the station name and the
 * program name or "Live radio". A theme is free to do something richer (see
 * Evia's own getMediaMetadata, e.g. E-9's "station -- program" packing) —
 * this is deliberately not opinionated about any particular theme's UX.
 */
function defaultMediaMetadata(station, nowPlaying) {
  return {
    title: station.name,
    artist: nowPlaying?.program || 'Live radio'
  };
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', () => player.play());
  navigator.mediaSession.setActionHandler('pause', () => player.stop());
  navigator.mediaSession.setActionHandler('previoustrack', goPrevious);
  navigator.mediaSession.setActionHandler('nexttrack', goNext);

  let nowPlaying = null; // {program, artist, title} | null — see player.js's 'nowplaying' event (C-14)

  // How the lock screen / OS media notification is worded is a theme's
  // presentation decision, the same category as the in-app header — not a
  // core concern. A theme opts in via getMediaMetadata(station, nowPlaying);
  // defaultMediaMetadata() above is the fallback for one that doesn't.
  function updateMetadata(station) {
    if (!station) return;
    const theme = activeTheme();
    const meta = theme.getMediaMetadata
      ? theme.getMediaMetadata(station, nowPlaying)
      : defaultMediaMetadata(station, nowPlaying);
    navigator.mediaSession.metadata = new MediaMetadata(meta);
  }

  player.addEventListener('state', (e) => {
    const { playing, station } = e.detail;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    nowPlaying = null;
    updateMetadata(station);
  });

  player.addEventListener('nowplaying', (e) => {
    nowPlaying = e.detail;
    updateMetadata(player.station);
  });
}

function ctx() {
  return {
    player,
    stationsDb,
    importExport,
    directory,
    t: i18n.t,
    selectStation,
    goNext,
    goPrevious,
    removeStation,
    removeAllStations,
    themes: THEMES,
    getActiveTheme: uiDb.getActiveTheme,
    getThemeSettings: uiDb.getThemeSettings,
    setThemeSettings: uiDb.setThemeSettings,
    switchTheme
  };
}

function setThemeStylesheet(theme) {
  let link = document.getElementById('theme-stylesheet');
  if (!link) {
    link = document.createElement('link');
    link.id = 'theme-stylesheet';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = `${theme.cssHref}?v=${VERSION}`;
}

function mount(themeId) {
  if (currentCleanup) currentCleanup();
  const theme = getTheme(themeId);
  setThemeStylesheet(theme);
  const container = document.getElementById('app');
  container.innerHTML = '';
  currentCleanup = theme.mount(container, ctx()) ?? null;
}

function switchTheme(id) {
  uiDb.setActiveTheme(id);
  mount(id);
}

async function boot() {
  await i18n.loadLanguage(uiDb.getLanguage());
  setupMediaSession();

  const lastId = stationsDb.getLastStationId();
  const station = lastId ? stationsDb.getStation(lastId) : null;
  if (station) {
    const autostart = !!uiDb.getThemeSettings(uiDb.getActiveTheme())?.autostart;
    player.load(station, autostart, { quiet: autostart });
  }

  mount(uiDb.getActiveTheme());
}

boot();
