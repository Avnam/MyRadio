// Import/export: the only module that knows the export file's JSON shape (C-5..C-9).
import * as stationsDb from './stations-db.js';

const FORMAT = 'radio-stations';

export function exportData() {
  return {
    format: FORMAT,
    version: 1,
    defaultCountry: stationsDb.getDefaultCountry(),
    stations: stationsDb.getStations().map(s => ({
      id: s.id,
      name: s.name,
      urls: s.urls,
      country: s.country,
      tags: s.tags,
      logo: s.logo,
      skippable: s.skippable,
      nowPlaying: s.nowPlaying
    }))
  };
}

export function exportText() {
  return JSON.stringify(exportData(), null, 2);
}

export async function exportToClipboard() {
  await navigator.clipboard.writeText(exportText());
}

export function exportToFile(filename = 'radio-stations.json') {
  const blob = new Blob([exportText()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

class ImportError extends Error {}

function extractStations(parsed) {
  if (Array.isArray(parsed)) return { stations: parsed, defaultCountry: null };
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.stations)) {
    return {
      stations: parsed.stations,
      defaultCountry: typeof parsed.defaultCountry === 'string' ? parsed.defaultCountry : null
    };
  }
  throw new ImportError('noStations');
}

function normalizeStation(raw, i) {
  if (!raw || typeof raw !== 'object') throw new ImportError('noStations');
  const urls = Array.isArray(raw.urls) ? raw.urls.filter(u => typeof u === 'string' && u) : [];
  const name = typeof raw.name === 'string' ? raw.name : null;
  if (!name || urls.length === 0) throw new ImportError('noStations');
  return {
    name,
    urls,
    country: typeof raw.country === 'string' ? raw.country : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    logo: typeof raw.logo === 'string' ? raw.logo : null,
    skippable: raw.skippable === true,
    nowPlaying: (raw.nowPlaying && typeof raw.nowPlaying === 'object') ? raw.nowPlaying : null
  };
}

/**
 * Parses and validates import text. Throws ImportError('invalidJson' | 'noStations')
 * on bad input, leaving the current list untouched (C-9), and never applies partial
 * changes to storage.
 */
export function parseImportText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new ImportError('invalidJson');
  }
  const { stations, defaultCountry } = extractStations(parsed);
  if (stations.length === 0) throw new ImportError('noStations');
  return { stations: stations.map(normalizeStation), defaultCountry };
}

/**
 * mode: 'add' (default, skips duplicate stream URLs) or 'replace'.
 * Returns { added, skipped }.
 */
export function applyImport({ stations, defaultCountry }, mode = 'add') {
  if (mode === 'replace') {
    stationsDb.removeAll();
  }
  if (defaultCountry) {
    stationsDb.setDefaultCountry(defaultCountry);
  }
  let added = 0, skipped = 0;
  for (const s of stations) {
    const result = stationsDb.addStation(s);
    if (result.added) added++; else skipped++;
  }
  return { added, skipped };
}

export { ImportError };
