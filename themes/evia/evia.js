// Evia: the first theme (E-1..E-5). Presentation and DOM wiring only — most rules
// (dedupe on add, wraparound next/previous, import validation, ...) live in
// js/core/* and are only ever called into, never re-implemented here.
//
// The one exception is skippable stations: whether next/previous should ever
// pass over a station is a theme's decision, not core's, so that policy lives
// entirely below, built on top of core's plain stationsDb.next/previous.
import * as stationsDb from '../../js/core/stations-db.js';
import { VERSION } from '../../js/version.js';

export const id = 'evia';
export const title = 'Evia';
export const defaultSettings = { autostart: false };
export const cssHref = 'themes/evia/evia.css';

function skipWalk(currentId, step) {
  const total = stationsDb.getStations().length;
  let candidate = step(currentId);
  for (let i = 0; candidate && candidate.skippable && i < total; i++) {
    candidate = step(candidate.id);
  }
  return candidate;
}

export function getNextStation(currentId) {
  return skipWalk(currentId, stationsDb.next);
}

export function getPreviousStation(currentId) {
  return skipWalk(currentId, stationsDb.previous);
}

/**
 * Lock screen / OS media notification wording (E-9) — a theme's own
 * presentation decision, the same category as the in-app header, not a core
 * concern (app.js falls back to a plain station-name-only default for a
 * theme that doesn't define this).
 *
 * There's no API to ask the OS/launcher how many lines its widget actually
 * has room for — it varies by device and can't be detected from a webpage.
 * So rather than gamble a field goes unseen, both of MediaMetadata's
 * guaranteed-visible fields carry two pieces of info each: title is the
 * station name alone, or "station -- program" once a program is known (the
 * station is never fully displaced, only ever gains company); artist is
 * "artist - title" track info, or "Live radio" when nothing's known.
 */
export function getMediaMetadata(station, nowPlaying) {
  const title = nowPlaying?.program ? `${station.name} -- ${nowPlaying.program}` : station.name;
  const track = nowPlaying && (nowPlaying.artist && nowPlaying.title
    ? `${nowPlaying.artist} - ${nowPlaying.title}`
    : nowPlaying.title || nowPlaying.artist);
  return { title, artist: track || 'Live radio' };
}

const ICONS = {
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5L20.5 19zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.9 9h-3.2a15 15 0 0 0-1.3-5.4A8 8 0 0 1 19.9 11zM12 4c.8 1.1 1.8 3 2.1 7H9.9c.3-4 1.3-5.9 2.1-7zM9.9 13h4.2c-.3 4-1.3 5.9-2.1 7-.8-1.1-1.8-3-2.1-7zM8.6 5.6A15 15 0 0 0 7.3 11H4.1a8 8 0 0 1 4.5-5.4zM4.1 13h3.2a15 15 0 0 0 1.3 5.4A8 8 0 0 1 4.1 13zm11.3 5.4a15 15 0 0 0 1.3-5.4h3.2a8 8 0 0 1-4.5 5.4z"/></svg>',
  importExport: '<svg viewBox="0 0 24 24"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3z"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.4 7.4 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.3 2.4a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.3-2.4a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>'
};

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sharesUrl(a, b) {
  return a.urls.some(u => b.urls.includes(u));
}

export function mount(container, ctx) {
  const { player, stationsDb, importExport, directory, t, selectStation, goNext, goPrevious,
          removeStation, removeAllStations, themes, switchTheme, getThemeSettings, setThemeSettings } = ctx;

  let view = 'main';
  let viewParams = {};
  let lastValidResults = null; // keeps the previous filtered list while a regex is invalid

  const shell = el(`
    <div class="evia">
      <div class="evia-shell">
        <div id="evia-header"></div>
        <div class="evia-tabbar">
          <button data-view="stations">${ICONS.list} ${t('toolbar.stations')}</button>
          <button data-view="search">${ICONS.search} ${t('toolbar.search')}</button>
          <button data-view="importExport">${ICONS.importExport} ${t('toolbar.importExport')}</button>
          <button data-view="settings">${ICONS.settings} ${t('toolbar.settings')}</button>
        </div>
        <div id="evia-panel"></div>
        <div id="evia-footer" class="evia-footer"></div>
      </div>
    </div>
  `);
  container.appendChild(shell);

  const headerEl = shell.querySelector('#evia-header');
  const panelEl = shell.querySelector('#evia-panel');
  const footerEl = shell.querySelector('#evia-footer');

  shell.querySelectorAll('.evia-tabbar button').forEach(btn => {
    btn.addEventListener('click', () => {
      goTo(view === btn.dataset.view ? 'main' : btn.dataset.view);
    });
  });

  function goTo(next, params) {
    view = next;
    viewParams = params ?? {};
    lastValidResults = null;
    renderPanel();
  }

  // --- header: top line + now playing + status --------------------------

  function renderHeader() {
    if (stationsDb.isEmpty()) {
      headerEl.innerHTML = `
        <div class="evia-empty">
          <p>${t('player.empty')}</p>
          <button id="evia-invite">${t('toolbar.search')}</button>
        </div>`;
      headerEl.querySelector('#evia-invite').addEventListener('click', () => goTo('search'));
      return;
    }

    const stations = stationsDb.getStations();
    const activeId = player.station?.id ?? stationsDb.getLastStationId();

    headerEl.innerHTML = `
      <div class="evia-topline">
        <button class="evia-icon-btn" id="evia-prev" aria-label="${t('common.back')}">${ICONS.prev}</button>
        <select id="evia-picker" aria-label="Choose a station">
          ${stations.map(s => `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <button class="evia-icon-btn" id="evia-toggle" aria-label="${player.playing ? t('common.pause') : t('common.play')}">${player.playing ? ICONS.pause : ICONS.play}</button>
        <button class="evia-icon-btn" id="evia-next" aria-label="Next">${ICONS.next}</button>
      </div>
      <p class="evia-nowplaying-program" id="evia-nowplaying-program">&nbsp;</p>
      <p class="evia-nowplaying-track" id="evia-nowplaying-track">&nbsp;</p>
      <p class="evia-status" id="evia-status">${t('player.pressPlay')}</p>
    `;

    headerEl.querySelector('#evia-prev').addEventListener('click', goPrevious);
    headerEl.querySelector('#evia-next').addEventListener('click', goNext);
    headerEl.querySelector('#evia-toggle').addEventListener('click', () => {
      if (player.playing) player.stop(); else player.play();
    });
    headerEl.querySelector('#evia-picker').addEventListener('change', (e) => {
      const station = stationsDb.getStation(e.target.value);
      if (station) selectStation(station, player.playing);
    });

    if (!player.station) {
      const first = stations.find(s => s.id === activeId) ?? stations[0];
      player.load(first, false);
    }
  }

  player.addEventListener('state', () => {
    if (view === 'stations') return; // list membership unaffected by playback state
    const toggle = headerEl.querySelector('#evia-toggle');
    if (toggle) {
      toggle.innerHTML = player.playing ? ICONS.pause : ICONS.play;
      toggle.setAttribute('aria-label', player.playing ? t('common.pause') : t('common.play'));
    }
    const picker = headerEl.querySelector('#evia-picker');
    if (picker && player.station) picker.value = player.station.id;
  });

  // Two lines when a station's now-playing source has data (C-14, E-3):
  // program name, then "artist - title". Either line just clears (not an
  // error) when there's no source, or nothing's reported right now.
  player.addEventListener('nowplaying', (e) => {
    const programEl = headerEl.querySelector('#evia-nowplaying-program');
    const trackEl = headerEl.querySelector('#evia-nowplaying-track');
    if (!programEl || !trackEl) return;
    const info = e.detail;
    programEl.textContent = info?.program || ' ';
    const track = info && (info.artist && info.title ? `${info.artist} - ${info.title}` : info.title || info.artist);
    trackEl.textContent = track || ' ';
  });

  player.addEventListener('status', (e) => {
    const statusEl = headerEl.querySelector('#evia-status');
    if (!statusEl) return;
    statusEl.textContent = t(e.detail.key, e.detail.params);
    statusEl.classList.toggle('is-error', !!e.detail.isError);
  });

  // --- stations panel: reorder (drag), remove one (drag out), remove all ---

  function renderStations() {
    const stations = stationsDb.getStations();
    panelEl.innerHTML = `
      <div class="evia-panel">
        <button class="evia-back" data-back>&larr; ${t('common.back')}</button>
        <h2>${t('tools.title')}</h2>
        ${stations.length === 0 ? `<p>${t('tools.empty')}</p>` : `
          <p class="evia-hint">${t('tools.skipHint')}</p>
          <ul class="evia-list" id="evia-list">
            ${stations.map(s => `
              <li draggable="true" data-id="${s.id}">
                <span class="evia-handle">&#8942;&#8942;</span>
                <span class="name">${escapeHtml(s.name)}</span>
                <input type="checkbox" class="evia-skip-box" data-skip="${s.id}" ${s.skippable ? 'checked' : ''}
                       title="${t('tools.skipAria', { name: s.name })}" aria-label="${t('tools.skipAria', { name: s.name })}">
                <button class="evia-remove" data-remove="${s.id}">&times;</button>
              </li>`).join('')}
          </ul>
          <div class="evia-row-buttons">
            <button id="evia-remove-all">${t('tools.removeAll')}</button>
          </div>
        `}
      </div>
    `;
    panelEl.querySelector('[data-back]').addEventListener('click', () => goTo('main'));

    const list = panelEl.querySelector('#evia-list');
    if (list) wireDragList(list);

    panelEl.querySelectorAll('[data-skip]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        stationsDb.setSkippable(checkbox.dataset.skip, checkbox.checked);
      });
    });

    panelEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm(t('tools.removeOneConfirm'))) {
          removeStation(btn.dataset.remove);
          renderHeader();
          renderStations();
        }
      });
    });

    const removeAllBtn = panelEl.querySelector('#evia-remove-all');
    if (removeAllBtn) removeAllBtn.addEventListener('click', () => {
      if (confirm(t('tools.removeAllConfirm'))) {
        removeAllStations();
        renderHeader();
        renderStations();
      }
    });
  }

  function wireDragList(list) {
    let draggingId = null;

    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('dragstart', () => {
        draggingId = li.dataset.id;
        li.classList.add('is-dragging');
      });

      li.addEventListener('dragend', (e) => {
        li.classList.remove('is-dragging');
        const rect = list.getBoundingClientRect();
        const outside = e.clientX < rect.left || e.clientX > rect.right ||
                         e.clientY < rect.top || e.clientY > rect.bottom;
        if (outside) {
          if (confirm(t('tools.removeOneConfirm'))) {
            removeStation(draggingId);
          }
          renderHeader();
          renderStations();
          return;
        }
        const ids = Array.from(list.children).map(el2 => el2.dataset.id);
        stationsDb.reorder(ids);
      });
    });

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = list.querySelector('.is-dragging');
      if (!dragging) return;
      const after = afterElement(list, e.clientY);
      if (after == null) list.appendChild(dragging);
      else list.insertBefore(dragging, after);
    });
  }

  function afterElement(list, y) {
    const items = Array.from(list.querySelectorAll('li:not(.is-dragging)'));
    let closest = null, closestOffset = -Infinity;
    for (const item of items) {
      const box = item.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = item;
      }
    }
    return closest;
  }

  // --- search: my country / a country ------------------------------------

  function stationAlreadyAdded(entry) {
    const candidate = { urls: entry.urls };
    return stationsDb.getStations().some(s => sharesUrl(s, candidate));
  }

  function renderSearchResults(root, countryData, code) {
    const dateEl = root.querySelector('.date');
    if (dateEl && countryData.builtAt) {
      const date = new Date(countryData.builtAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
      dateEl.textContent = t('search.directoryDate', { date });
    }
    const input = root.querySelector('input[type="text"]');
    const listEl = root.querySelector('.evia-search-results');

    function renderList(results) {
      listEl.innerHTML = results.length === 0
        ? `<p>${t('search.noResults')}</p>`
        : results.map(s => {
            const added = stationAlreadyAdded(s);
            return `
              <div class="evia-result">
                <span>${escapeHtml(s.name)}${s.city ? ' &middot; ' + escapeHtml(s.city) : ''}</span>
                <button data-add="${escapeHtml(s.name)}" ${added ? 'disabled' : ''}>
                  ${added ? t('search.alreadyAdded') : t('search.add')}
                </button>
              </div>`;
          }).join('');
      listEl.querySelectorAll('[data-add]').forEach((btn, i) => {
        btn.addEventListener('click', () => {
          const entry = results[i];
          stationsDb.addStation({
            name: entry.name, urls: entry.urls, tags: entry.tags ?? [],
            logo: entry.logo ?? null, country: code, nowPlaying: entry.nowPlaying ?? null
          });
          renderHeader();
          renderList(results);
        });
      });
    }

    function applyFilter() {
      try {
        const filtered = directory.search(countryData.stations, input.value);
        lastValidResults = filtered;
        input.classList.remove('is-invalid');
        renderList(filtered);
      } catch {
        input.classList.add('is-invalid');
        renderList(lastValidResults ?? countryData.stations);
      }
    }

    input.addEventListener('input', applyFilter);
    renderList(countryData.stations);
  }

  function renderSearchChooser() {
    panelEl.innerHTML = `
      <div class="evia-panel">
        <button class="evia-back" data-back>&larr; ${t('common.back')}</button>
        <h2>${t('toolbar.search')}</h2>
        <div class="evia-row-buttons evia-search-choices">
          <button id="evia-choose-mine">${ICONS.search} ${t('toolbar.searchMyCountry')}</button>
          <button id="evia-choose-other">${ICONS.globe} ${t('toolbar.searchACountry')}</button>
        </div>
      </div>
    `;
    panelEl.querySelector('[data-back]').addEventListener('click', () => goTo('main'));
    panelEl.querySelector('#evia-choose-mine').addEventListener('click', () => goTo('searchMine'));
    panelEl.querySelector('#evia-choose-other').addEventListener('click', () => goTo('searchPicker'));
  }

  async function renderSearchMine() {
    const code = stationsDb.getDefaultCountry();
    panelEl.innerHTML = `
      <div class="evia-panel evia-search">
        <button class="evia-back" data-back>&larr; ${t('common.back')}</button>
        <h2 id="evia-search-title">${t('search.title', { country: code })}</h2>
        <p class="date"></p>
        <input type="text" placeholder="${t('search.placeholder')}">
        <div class="evia-search-results"></div>
      </div>
    `;
    panelEl.querySelector('[data-back]').addEventListener('click', () => goTo('search'));
    try {
      const data = await directory.loadCountry(code);
      panelEl.querySelector('#evia-search-title').textContent = t('search.title', { country: data.name ?? code });
      renderSearchResults(panelEl, data, code);
    } catch (e) {
      panelEl.querySelector('.evia-search-results').textContent = e.message;
    }
  }

  async function renderSearchPicker() {
    panelEl.innerHTML = `
      <div class="evia-panel evia-search">
        <button class="evia-back" data-back>&larr; ${t('common.back')}</button>
        <h2>${t('search.chooseCountry')}</h2>
        <input type="text" placeholder="${t('search.placeholder')}">
        <ul class="evia-list" id="evia-country-list"></ul>
      </div>
    `;
    panelEl.querySelector('[data-back]').addEventListener('click', () => goTo('search'));
    const input = panelEl.querySelector('input');
    const listEl = panelEl.querySelector('#evia-country-list');

    let countries = [];
    try {
      countries = (await directory.loadCountries()).countries;
    } catch (e) {
      listEl.innerHTML = `<li>${escapeHtml(e.message)}</li>`;
      return;
    }

    function renderCountries(items) {
      listEl.innerHTML = items.map(c => `
        <li><span class="name">${escapeHtml(c.name)} (${c.count})</span>
        <button class="evia-remove" data-code="${c.code}" style="color:var(--evia-signal)">&rarr;</button></li>
      `).join('');
      listEl.querySelectorAll('[data-code]').forEach(btn => {
        btn.addEventListener('click', () => goTo('searchCountry', { code: btn.dataset.code }));
      });
    }

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      renderCountries(countries.filter(c => c.name.toLowerCase().includes(q)));
    });
    renderCountries(countries);
  }

  async function renderSearchCountry(code) {
    panelEl.innerHTML = `
      <div class="evia-panel evia-search">
        <button class="evia-back" data-back>&larr; ${t('search.chooseCountry')}</button>
        <h2 id="evia-search-title"></h2>
        <p class="date"></p>
        <input type="text" placeholder="${t('search.placeholder')}">
        <div class="evia-row-buttons" style="margin-bottom:12px">
          <button id="evia-make-default"></button>
        </div>
        <div class="evia-search-results"></div>
      </div>
    `;
    panelEl.querySelector('[data-back]').addEventListener('click', () => goTo('searchPicker'));
    try {
      const data = await directory.loadCountry(code);
      panelEl.querySelector('#evia-search-title').textContent = t('search.title', { country: data.name ?? code });
      const defaultBtn = panelEl.querySelector('#evia-make-default');
      const syncDefaultBtn = () => {
        const isDefault = stationsDb.getDefaultCountry() === code;
        defaultBtn.textContent = isDefault ? t('search.isDefault') : t('search.makeDefault');
        defaultBtn.disabled = isDefault;
      };
      defaultBtn.addEventListener('click', () => {
        stationsDb.setDefaultCountry(code);
        syncDefaultBtn();
      });
      syncDefaultBtn();
      renderSearchResults(panelEl, data, code);
    } catch (e) {
      panelEl.querySelector('.evia-search-results').textContent = e.message;
    }
  }

  // --- settings: just Autostart for now (theme lives in the footer, C-16) --

  function renderSettings() {
    const settings = getThemeSettings(id) ?? defaultSettings;
    panelEl.innerHTML = `
      <div class="evia-panel">
        <button class="evia-back" data-back>&larr; ${t('common.back')}</button>
        <h2>${t('settings.title')}</h2>

        <div class="evia-field">
          <label class="evia-checkbox-field">
            <input type="checkbox" id="evia-autostart" ${settings.autostart ? 'checked' : ''}>
            ${t('settings.autostart')}
          </label>
        </div>
      </div>
    `;
    panelEl.querySelector('[data-back]').addEventListener('click', () => goTo('main'));
    panelEl.querySelector('#evia-autostart').addEventListener('change', (e) => {
      setThemeSettings(id, { ...settings, autostart: e.target.checked });
    });
  }

  // --- import / export -----------------------------------------------------

  function renderImportExport() {
    panelEl.innerHTML = `
      <div class="evia-panel">
        <button class="evia-back" data-back>&larr; ${t('common.back')}</button>
        <h2>${t('toolbar.importExport')}</h2>

        <div class="evia-field">
          <label>${t('settings.export')}</label>
          <div class="evia-row-buttons">
            <button id="evia-export-file">${t('settings.exportToFile')}</button>
            <button id="evia-export-clip">${t('settings.exportToClipboard')}</button>
          </div>
          <p class="evia-status" id="evia-export-status"></p>
        </div>

        <div class="evia-field">
          <label>${t('settings.import')}</label>
          <input type="file" id="evia-import-file" accept="application/json">
          <textarea id="evia-import-text" placeholder="${t('settings.importPaste')}"></textarea>
          <div class="evia-row-buttons">
            <button id="evia-import-add" data-mode="add">${t('settings.importAdd')}</button>
            <button id="evia-import-replace" data-mode="replace">${t('settings.importReplace')}</button>
          </div>
          <p class="evia-status" id="evia-import-status"></p>
        </div>
      </div>
    `;
    panelEl.querySelector('[data-back]').addEventListener('click', () => goTo('main'));

    panelEl.querySelector('#evia-export-file').addEventListener('click', () => importExport.exportToFile());
    panelEl.querySelector('#evia-export-clip').addEventListener('click', async () => {
      await importExport.exportToClipboard();
      panelEl.querySelector('#evia-export-status').textContent = t('settings.exportCopied');
    });

    const importStatus = panelEl.querySelector('#evia-import-status');
    const textArea = panelEl.querySelector('#evia-import-text');
    const fileInput = panelEl.querySelector('#evia-import-file');

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (file) textArea.value = await file.text();
    });

    function runImport(mode) {
      try {
        const parsed = importExport.parseImportText(textArea.value);
        const result = importExport.applyImport(parsed, mode);
        importStatus.classList.remove('is-error');
        importStatus.textContent = t('settings.importResult', result);
        renderHeader();
      } catch (e) {
        importStatus.classList.add('is-error');
        importStatus.textContent = e.message === 'noStations'
          ? t('settings.importNoStations')
          : t('settings.importInvalidJson', { detail: e.message });
      }
    }

    panelEl.querySelector('#evia-import-add').addEventListener('click', () => runImport('add'));
    panelEl.querySelector('#evia-import-replace').addEventListener('click', () => runImport('replace'));
  }

  // --- footer: theme picker, persistent across every view (C-16) -----------

  function renderFooter() {
    footerEl.innerHTML = `
      <label class="evia-footer-theme">
        ${t('settings.theme')}
        <select id="evia-theme-select">
          ${themes.map(th => `<option value="${th.id}">${escapeHtml(th.title)}</option>`).join('')}
        </select>
      </label>
      <p class="evia-version">v${escapeHtml(VERSION)}</p>
    `;
    const themeSelect = footerEl.querySelector('#evia-theme-select');
    themeSelect.value = id;
    themeSelect.addEventListener('change', () => switchTheme(themeSelect.value));
  }

  // --- view dispatch -------------------------------------------------------

  function renderPanel() {
    if (view === 'main') { panelEl.innerHTML = ''; return; }
    if (view === 'stations') return renderStations();
    if (view === 'search') return renderSearchChooser();
    if (view === 'searchMine') return renderSearchMine();
    if (view === 'searchPicker') return renderSearchPicker();
    if (view === 'searchCountry') return renderSearchCountry(viewParams.code);
    if (view === 'importExport') return renderImportExport();
    if (view === 'settings') return renderSettings();
  }

  renderHeader();
  renderPanel();
  renderFooter();

  return function cleanup() {
    container.innerHTML = '';
  };
}
