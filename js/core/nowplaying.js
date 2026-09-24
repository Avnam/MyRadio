// Now-playing metadata (C-14): a station's own record may carry a nowPlaying
// field naming a small JSON source that reports its current program/artist/
// title (see stations-db.js's addStation/setNowPlaying) — described as data,
// not code. A station with no nowPlaying simply never gets a 'nowplaying'
// event; nothing shows, nothing errors.

/** Resolves a dotted path like "fields.artist_name.stringValue" against an object. */
function getPath(obj, path) {
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

function readField(data, path) {
  if (!path) return null;
  let value = getPath(data, path);
  if (Array.isArray(value)) value = value.join(', ');
  return value || null;
}

/** Pulls {program, artist, title} out of a parsed JSON response per a source's field paths. */
export function extractNowPlaying(source, data) {
  if (!data) return null;
  const program = readField(data, source.program);
  const artist = readField(data, source.artist);
  const title = readField(data, source.title);
  if (!program && !artist && !title) return null;
  return { program, artist, title };
}

const SOURCE_FIELDS = ['url', 'program', 'artist', 'title', 'refresh'];

/**
 * Field-by-field, not JSON.stringify — a station whose nowPlaying arrived via
 * import can have its fields in a different key order than the directory's
 * copy despite identical values, and JSON.stringify is order-sensitive. Used
 * to tell whether a fresher source (C-14c) is an actual change worth applying
 * and telling the listener about, not a false positive from key order alone.
 */
export function sameNowPlayingSource(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return SOURCE_FIELDS.every(f => a[f] === b[f]);
}

/**
 * Polls source.url every source.refresh seconds (default 20), calling
 * onUpdate(info | null) whenever the result changes. Never throws — a
 * network error, CORS block, or empty response (e.g. Kan's 204 between
 * songs) just means no data this round, not a broken station.
 */
export function watchNowPlaying(source, onUpdate, { signal } = {}) {
  let lastKey = undefined;

  function emit(info) {
    const key = info ? `${info.program}|${info.artist}|${info.title}` : null;
    if (key === lastKey) return;
    lastKey = key;
    onUpdate(info);
  }

  async function poll() {
    if (signal?.aborted) return;
    let info = null;
    try {
      const res = await fetch(source.url, { signal });
      const text = res.ok ? await res.text() : '';
      const data = text ? JSON.parse(text) : null;
      info = extractNowPlaying(source, data);
    } catch {
      info = null;
    }
    if (signal?.aborted) return;
    emit(info);
  }

  poll();
  const timer = setInterval(poll, (source.refresh ?? 20) * 1000);
  signal?.addEventListener('abort', () => clearInterval(timer));
}
