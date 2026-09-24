// Station directory: published JSON files, one per country, plus a countries index.
// The app never calls Radio Browser directly (C-10) — only these static files.

const countryCache = new Map();
const nowPlayingMapCache = new Map();
let countriesPromise = null;

export function loadCountries() {
  if (!countriesPromise) {
    countriesPromise = fetch('directory/countries.json')
      .then(res => {
        if (!res.ok) throw new Error('Could not load country list');
        return res.json();
      });
  }
  return countriesPromise;
}

/** Strips the query string/fragment, so a station's URL still matches a source
 *  keyed by its canonical form even when Radio Browser adds its own query params. */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

/** Attaches nowPlaying (C-14) to any station with a matching stream URL. */
export function mergeNowPlaying(stations, nowPlayingMap) {
  if (!nowPlayingMap) return stations;
  return stations.map(station => {
    for (const url of station.urls) {
      const match = nowPlayingMap[normalizeUrl(url)];
      if (match) return { ...station, nowPlaying: match };
    }
    return station;
  });
}

// directory/<CODE>_metadata.json (C-14): hand-maintained, per country, fetched
// only for a country that's actually in use — not every country has one, and
// that's the normal case, not an error. Cached per session either way, so a
// country's file is only ever fetched once regardless of how many times its
// stations get looked at.
function loadNowPlayingMapFor(code) {
  if (!nowPlayingMapCache.has(code)) {
    nowPlayingMapCache.set(code, fetch(`directory/${code}_metadata.json`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => data?.nowPlaying ?? null)
      .catch(() => null));
  }
  return nowPlayingMapCache.get(code);
}

export async function loadCountry(code) {
  if (!countryCache.has(code)) {
    countryCache.set(code, (async () => {
      const res = await fetch(`directory/${code}.json`);
      if (!res.ok) throw new Error(`Could not load directory for '${code}'`);
      const data = await res.json();
      const nowPlayingMap = await loadNowPlayingMapFor(code);
      if (nowPlayingMap) data.stations = mergeNowPlaying(data.stations, nowPlayingMap);
      return data;
    })());
  }
  return countryCache.get(code);
}

/**
 * Looks up the current published now-playing source for a station, by
 * country and stream URL — used to refresh an already-added station's own
 * (possibly stale) copy against the latest directory data each time it
 * actually connects, not just when you first add it. Returns null when the
 * station's country is unknown, or nothing matches.
 */
export async function findNowPlayingSource(countryCode, urls) {
  if (!countryCode) return null;
  const map = await loadNowPlayingMapFor(countryCode);
  if (!map) return null;
  for (const url of urls) {
    const match = map[normalizeUrl(url)];
    if (match) return match;
  }
  return null;
}

/**
 * Filters a country's stations with a case-insensitive regular expression
 * against name, tags and city (C-10d). Throws SyntaxError on an invalid
 * pattern — callers should keep the list's last valid result on that.
 */
export function search(stations, pattern) {
  if (!pattern) return stations;
  const re = new RegExp(pattern, 'i');
  return stations.filter(s => {
    const haystack = [s.name, s.city, ...(s.tags ?? [])].filter(Boolean).join('   ');
    return re.test(haystack);
  });
}
