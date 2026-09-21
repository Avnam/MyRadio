// Boots core, then mounts the active look. Owns the one shared Player instance and
// the Media Session wiring, since both need stations-db + player together, not any
// one look's markup.
import * as stationsDb from './core/stations-db.js';
import * as uiDb from './core/ui-db.js';
import * as importExport from './core/import-export.js';
import * as directory from './core/directory.js';
import * as i18n from './core/i18n.js';
import { Player } from './core/player.js';
import { LOOKS, getLook } from './core/looks.js';

const player = new Player();
let currentCleanup = null;

function selectStation(station, autoplay) {
  stationsDb.setLastStationId(station.id);
  player.load(station, autoplay);
}

function goNext() {
  const station = stationsDb.next(player.station?.id ?? stationsDb.getLastStationId());
  if (station) selectStation(station, player.playing);
}

function goPrevious() {
  const station = stationsDb.previous(player.station?.id ?? stationsDb.getLastStationId());
  if (station) selectStation(station, player.playing);
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play', () => player.play());
  navigator.mediaSession.setActionHandler('pause', () => player.stop());
  navigator.mediaSession.setActionHandler('previoustrack', goPrevious);
  navigator.mediaSession.setActionHandler('nexttrack', goNext);

  player.addEventListener('state', (e) => {
    const { playing, station } = e.detail;
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    if (station) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: 'Live radio'
      });
    }
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
    looks: LOOKS,
    getActiveLook: uiDb.getActiveLook,
    getLookSettings: uiDb.getLookSettings,
    setLookSettings: uiDb.setLookSettings,
    switchLook
  };
}

function setLookStylesheet(look) {
  let link = document.getElementById('look-stylesheet');
  if (!link) {
    link = document.createElement('link');
    link.id = 'look-stylesheet';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = look.cssHref;
}

function mount(lookId) {
  if (currentCleanup) currentCleanup();
  const look = getLook(lookId);
  setLookStylesheet(look);
  const container = document.getElementById('app');
  container.innerHTML = '';
  currentCleanup = look.mount(container, ctx()) ?? null;
}

function switchLook(id) {
  uiDb.setActiveLook(id);
  mount(id);
}

async function boot() {
  await i18n.loadLanguage(uiDb.getLanguage());
  setupMediaSession();
  mount(uiDb.getActiveLook());

  const lastId = stationsDb.getLastStationId();
  if (lastId) {
    const station = stationsDb.getStation(lastId);
    if (station) player.load(station, false);
  }
}

boot();
