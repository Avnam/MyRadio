// Known now-playing sources, keyed by stream URL (C-14). Each is verified
// working and CORS-open for this app's origin — see REQUIREMENTS.md's "What
// testing has shown" for how. A station whose URL isn't listed here simply
// gets no now-playing data; that's the normal case, not an error.
const SOURCES = [
  {
    urls: [
      'https://eco01.livecdn.biz/ecolive/99fm_aac/icecast.audio',
      'https://eco-live.mediacast.co.il/99fm_aac'
    ],
    source: {
      url: 'https://firestore.googleapis.com/v1/projects/eco-99-production/databases/(default)/documents/streamed_content/program',
      program: 'fields.program_name.stringValue',
      artist: 'fields.artist_name.stringValue',
      title: 'fields.song_name.stringValue',
      refresh: 20
    }
  }
  // Kan 88 (channelId=4) is not listed yet: its API is genuinely CORS-open
  // and returns real data, but sits behind Cloudflare, which challenged it
  // in every automated test here — including a real (if headless) browser,
  // not just curl. Headless/automated browsers are more readily flagged by
  // Cloudflare than a normal one, so that result may not hold for an actual
  // user session; needs confirming from the real deployed origin in a real
  // browser before it's added. See "What testing has shown".
];

/** Finds the now-playing source for a station by matching any of its stream URLs. */
export function findNowPlayingSource(station) {
  for (const entry of SOURCES) {
    if (station.urls.some(u => entry.urls.includes(u))) return entry.source;
  }
  return null;
}
