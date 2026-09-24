# Radio player: requirements

Draft v0.5, 22 September 2026

## Goal

A personal live-radio player for desktop and phone. Your station list lives in the browser and moves between devices by export/import. The app's theme can be swapped: several themes share one core, and the first theme is called **Evia**.

## How it runs

- **Hosted on GitHub Pages.** Static files only, no server. Works on desktop and phone from one address.
- **Development:** a page opened from disk (`file://`) can't load `.json` files or JavaScript modules; the browser blocks it. Since the app now loads station directory files and language files, it runs during development from a local web server:
  ```powershell
  cd C:\tmp\xx\radio; python -m http.server 8000
  Start-Process msedge http://localhost:8000
  ```
  That is the same way GitHub Pages serves it, so what works locally works online.
- GitHub Pages is https, so the browser blocks `http://` streams (mixed content). Only `https://` stream URLs can be added.
- **Target phone:** Android (Chrome). Background playback and Bluetooth controls are tested there.

## Core requirements (all themes)

### Stations database

- **C-1** Your stations live in the browser's local storage, in the **stations database**. Nothing is built in: on first open the list is empty.
- **C-2** The stations database also stores the last station played. It is used to restore that station next time and is never exported.
- **C-3** Remove stations one at a time, or all at once after a confirmation.
- **C-4** Core's next/previous wrap around: next on the last station goes to the first, previous on the first goes to the last. This is the plain, universal stepping rule — a theme may layer its own policy on top of it (see C-19).
- **C-19** Removing the station currently loaded in the player automatically moves on to the next station (using the active theme's own next-station logic — see C-19a), if any remain. Removing the last station clears the player.
- **C-19a** Each station may be flagged **skippable**. The flag itself is core data (stored, exported, imported with the station), but whether next/previous ever acts on it is entirely up to the active theme — core's own next/previous (C-4) never skips. A theme that doesn't care about the flag simply ignores it and gets plain C-4 wraparound.

### Import and export

- **C-5** The file format is JSON.
- **C-6** Export to a file or copy to the clipboard.
- **C-7** Import from a file, or paste into a text box where the JSON can be edited before importing. (Copy on one device, paste on another.)
- **C-8** Import either **adds** to your stations (default) or **replaces** them. Adding skips any station whose stream URL is already in your list.
- **C-9** Invalid JSON, or a file with no stations, is rejected with a message saying what is wrong. Your list is left untouched.

### Station directory

- **C-10** Adding stations comes from a **station directory** published with the app: one JSON file per country, plus an index of countries. The app never calls Radio Browser directly.
- **C-10a** A Python script (`tools/build_directory.py`) builds the directory from Radio Browser. You run it by hand and commit the result to GitHub. It:
  - fetches every station, grouped by country code
  - keeps only stations that passed their last check and have an `https://` stream
  - removes duplicates (same stream URL)
  - writes `directory/countries.json` (code, name, station count) and `directory/<CODE>.json` per country — pure Radio Browser data; it doesn't know about `nowPlaying` (C-14) at all, since `directory/<CODE>.json` is fully overwritten on every rebuild and would silently lose anything hand-curated mixed into it
  - sets a descriptive User-Agent, as Radio Browser asks
- **C-10b** Each directory file records when it was built, and the app shows that date in search ("Directory from 21 Sep 2026").
- **C-10c** Your **default country** is stored in the stations database and exported with it. Until you set one, it is Israel.
- **C-10d** Search opens a country's list and filters it with a regular expression, case-insensitive, against name, tags and city. While the expression is invalid, the list keeps its last result and the box is marked.

Directory entry:

```json
{ "name": "Galgalatz", "urls": ["https://glzwizzlv.bynetcdn.com/glglz_mp3"],
  "tags": ["pop", "rock"], "city": "Tel Aviv", "codec": "MP3", "bitrate": 128,
  "logo": "https://...", "votes": 1234 }
```

Sizes in practice, after the first real build (22 September 2026): 241 countries, ~13 MB total. Israel is ~40 KB (a few hundred stations); the largest, Germany, is ~1.3 MB (~3,100 stations).

### Languages

- **C-10e** Every piece of text the app shows (buttons, messages, labels, tooltips) comes from a language file, `lang/en.json`. English is the only language for now; adding one means adding a file.
- **C-10f** Language is a core setting shared by all themes, stored in the UI database.

### Playback

- **C-11** Playback continues in the background: other tab, minimized window, phone screen locked.
- **C-12** Responds to play/pause, next and previous from keyboard media keys, headphones, the phone lock screen and Bluetooth (for example, car controls). These use the same next/previous logic as the on-screen buttons (C-19a) — a theme's skip policy applies to hardware keys too.
- **C-13** Each station can have several stream URLs. If one fails the app tries the next, and after a drop mid-stream it reconnects. Errors say what was tried. *(Built in the prototype.)*
- **C-13a** Once a station is loaded and a connection attempt is in flight, a rapid next/previous/play press never interrupts it — the request is queued (only the latest survives a burst) and applied as soon as the current attempt settles, or after 5s if it's taking unusually long. Three compounding bugs used to break this: (1) every press tore down the in-flight `<audio>` element immediately, killing a connection before it had any real chance to succeed; (2) `playing` only became true once audio was actually flowing, not from the moment an attempt started, so a press made while the station you'd just switched to was still buffering read `playing` as false and silently downgraded to "select only" (decision #2) — no error, no queue, just quietly dropped; (3) the safety-valve grace period was tuned against a fast desktop connection (900ms) — real mobile/cellular connects are often slower than that, so the valve kept firing and interrupting a perfectly healthy connection anyway. Verified against a real controlled slow-connect test (not just real radio, which usually connects too fast locally to prove anything), not just theory.
- **C-13b** Pausing never destroys the `<audio>` element, only pauses it — destroying it (as pausing used to) made Android Chrome drop the page's Media Session, handing "now playing" focus to another app (e.g. Spotify), so resuming from the lock screen or a hardware key would resume that app instead of this one.
- **C-14** Shows what is playing (program name, then artist and title) where the station makes it available. ICY in-stream metadata doesn't work for any of the 7 test stations (see "What testing has shown", 22 September 2026) — CORS blocks the browser from reading it. Instead, a station's own record may carry a `nowPlaying` field: a JSON endpoint plus dotted field paths (`{url, program, artist, title, refresh}`), described as data, not code — see extractNowPlaying() in `js/core/nowplaying.js`. It's part of the stations database (C-1), the same as `skippable`, and travels with a station through export/import. It arrives one of two ways: (a) added by hand, e.g. via import — see `dev/seed-stations.json`; or (b) already attached when you add a station through Search, because it's also published per-country in `directory/<CODE>_metadata.json` — hand-maintained, keyed by stream URL, written only for a country that actually has an entry. `directory.js` fetches that one file alongside `<CODE>.json` *only when that country is searched* (not every country's data, so adding stations from Israel never downloads Germany's), and merges a match into a station by stream URL, ignoring the query string (Radio Browser can add its own to the same station's URL) before you ever see the results. A station with no `nowPlaying` (the normal case) simply never shows anything; one that fails (network error, empty response, CORS block) fails silently the same way, never as an error.
- **C-14a** In Evia's header, when a source has data it replaces "Live radio" with two lines: program name, then "artist - title". Falls back cleanly to blank the moment data isn't available — mid-song is not different from a station with no source at all.
- **C-14b** On the lock screen / OS media notification, the station name is always the title — it's the one constant identity and never gets replaced by now-playing data, unlike the header. Program name goes in `artist`, and "artist - title" track info goes in `album` (`MediaMetadata` has three text fields; using all three keeps the station name visible instead of being displaced by the live info). Not every OS/launcher renders all three — some compact views only show two lines — but nothing here is hiding the station on purpose.
- **C-14c** A station's stored `nowPlaying` isn't frozen at add-time: every time it actually starts a real connection, the app checks that country's current `directory/<CODE>_metadata.json` and updates the station's own copy if it's different — quietly, in the background, never delaying or interrupting playback. This is how a later fix to a source reaches a station someone already added, not just new additions.

### Themes

- **C-15** The app has several themes, listed in the app's own code (not in your local storage). Evia is the first.
- **C-16** Your settings for the app are stored separately from the stations, in the **UI database**. It holds the chosen theme plus a separate settings section for each theme, so switching themes never mixes their settings.
- **C-17** Every theme must offer at least:
  - switching to another theme
  - next and previous station
  - adding and removing stations
- **C-18** *(Later)* Buffering and rewind of the live audio, switched on per theme. Needs a feasibility test first; see "Later".

## Evia (first theme)

- **E-1** Futuristic blue styling.
- **E-2** Top line, left to right: **previous** icon, the **station name box** (a dropdown of your stations), **play/pause** icon, **next** icon. Previous/next switch to the previous/next station in your list, skipping any station flagged skippable (C-19a) — Evia is the theme that defines and honors this flag.
- **E-3** Second line: what is playing, when available.
- **E-4** Below the two lines, four icons:
  - **Stations** opens your station list. Drag a station by its handle (≡) to reorder. Dragging a station out of the list asks "Remove this station?" (Yes/No). A one-time hint ("Skip in next/previous") sits above the list; each row just has the bare checkbox, not a repeated label. Also holds **Remove all**.
  - **Search** opens a chooser between **Search my country** (the directory for your default country, with the regular expression filter, C-10d) and **Search a country** (asks for a country first, itself filterable, and lets you make it your default). Tapping a result adds it to your list.
  - **Import / Export** holds file/clipboard export and file/paste import — its own icon, separate from Settings.
  - **Settings** holds Autostart (E-7).
  - Pressing an already-open icon again closes it, the same as pressing Back (E-6).
- **E-5** Empty state: with no stations, the top line invites you to search for stations.
- **E-6** Each of the four bottom icons acts as a toggle: opening one while it is already open returns to the main view, same as Back.
- **E-7** Evia has an **Autostart** setting (Settings panel, off by default): when on, the app tries to resume playing your last station automatically when opened. Browsers block audio starting without a real tap on the page, no matter how long the app waits first — that's a platform limitation, not something a website can override — so when the attempt is blocked, Evia falls back quietly to the normal "Press play to connect." state rather than showing an error; it looks and behaves exactly like Autostart being off until you tap Play once. Stored in Evia's own settings section (`themes.evia.autostart`), per C-16.
- **E-8** The **Theme** picker is not inside Settings — it's a persistent footer at the very bottom of the page, visible under every view (main screen or any opened panel), since it's a C-16 concern shared by the whole app, not an Evia-specific setting.

## Stored data

| Store | Key | Contents | Exported |
|---|---|---|---|
| Stations database | `radio.stations` | Stations in your order (including each one's `skippable` flag and optional `nowPlaying` source), default country, last station played | Stations (with `skippable` and `nowPlaying`) and default country |
| UI database | `radio.ui` | Language, active theme, per-theme settings (`themes.evia`, ...) | No |

Files published with the app (on GitHub):

| Path | Contents |
|---|---|
| `directory/countries.json` | Countries with station counts, build date |
| `directory/<CODE>.json` | Stations in one country — pure Radio Browser data |
| `directory/<CODE>_metadata.json` | That country's now-playing sources (C-14), hand-maintained, keyed by stream URL — only written for a country that has at least one |
| `lang/en.json` | All app text in English |
| `themes/evia/` | Evia's markup, styles and settings defaults |
| `tools/build_directory.py` | Builds `directory/` from Radio Browser |

Export file:

```json
{
  "format": "radio-stations",
  "version": 1,
  "defaultCountry": "IL",
  "stations": [
    {
      "id": "eco99",
      "name": "אקו 99",
      "urls": [
        "https://eco01.livecdn.biz/ecolive/99fm_aac/icecast.audio",
        "https://eco-live.mediacast.co.il/99fm_aac"
      ],
      "country": "IL",
      "tags": ["pop", "hits"],
      "logo": "https://...",
      "skippable": false,
      "nowPlaying": {
        "url": "https://firestore.googleapis.com/v1/projects/eco-99-production/databases/(default)/documents/streamed_content/program",
        "program": "fields.program_name.stringValue",
        "artist": "fields.artist_name.stringValue",
        "title": "fields.song_name.stringValue",
        "refresh": 20
      }
    }
  ]
}
```

`nowPlaying` is optional and omitted or `null` for most stations (C-14). When present: `url` is the JSON endpoint to poll; `program`/`artist`/`title` are dotted paths into that response (an array value, like Kan's `artists`, is joined with commas); `refresh` is the poll interval in seconds (default 20).

Import also accepts a bare list of stations (`[ {...}, {...} ]`).

## Working decisions (change any of them)

1. **Default country** is stored with your stations and exported, so a new device picks it up on import.
2. **Choosing a station** in the dropdown or with next/previous starts playing it when something is already playing. When stopped, it only selects.
3. **Adding a station** that is already in your list (same stream URL) does nothing except say so.
4. **The directory is rebuilt by hand.** A GitHub Action could run the script weekly instead; that is a later option.
5. **Skippable is theme policy, not core policy.** Core (`stations-db.js`) only stores the flag; whether next/previous honors it lives entirely in the active theme (Evia today). A future theme is free to ignore the flag, or to implement its own different skip behavior.
6. **New stations default to not skippable**, so adding or importing stations never silently changes existing next/previous behavior.

## What testing has shown (22 September 2026)

- All 7 test stations play from your PC in Edge: Eco 99, Galgalatz, Galgalatz Rock, Galei Tzahal, Kan Bet, Kan 88, Kan Gimmel.
- `eco-live.mediacast.co.il` plays normally but fails in CORS mode.
- The preview pane inside the Claude app blocks these streams. Test in Edge or Chrome.
- **Song titles via ICY in-stream metadata (C-14):** all 7 stations interleave it (`icy-metaint: 16000` on every one), but none let the browser read it — every one fails the `Icy-MetaData` header's CORS preflight, confirmed via a real Edge session, not just header inspection.
- **Song titles via a station's own now-playing API — the path that actually works:** Eco 99's Firestore endpoint (`firestore.googleapis.com/.../streamed_content/program`) is fully verified: real data, and `Access-Control-Allow-Origin` echoes back this app's exact origin. Its config is in `directory/IL_metadata.json` — so searching and adding Eco 99 attaches it automatically, no manual step, and only Israel's search ever fetches it (verified: searching Germany requests `DE.json`/`DE_metadata.json` only, never touches Israel's file). It's also in `dev/seed-stations.json` for hand-adding via import. Kan 88's API (`kan.org.il/api/arc-cloud/get-live-track-data?channelId=4`) also returns real data and is nominally CORS-open, but sits behind Cloudflare, which challenged every automated test here — curl, and a real (if headless) browser fetching cross-origin. Headless/automated browsers are more readily flagged by Cloudflare than a normal one, so this may not hold for an actual user session; its config is included the same way, for you to test from the real deployed origin in a real (non-headless) browser before trusting it. The directory carries **two** distinct URLs for Kan 88 (`88 FM` via StreamTheWorld, `KAN 88` via Kan's own HLS CDN) — the same public-broadcaster channel over two different relays, so both are mapped to the same source in `IL_metadata.json`, unverified either could actually confirm the assumption. Galgalatz and Galei Tzahal aren't known to expose any now-playing source at all yet.
- **A `nowPlaying` entry is a static config, edited by hand — but stations already in your list still catch up to it.** The song/program it reports updates live (polling while playing). The config itself — which endpoint, which field paths — only changes when someone edits `directory/<CODE>_metadata.json` and it gets deployed; nothing here makes a station *discover* a source on its own. But a station's own copy isn't frozen forever at add-time either: every time it actually starts a real connection, the app quietly checks that country's current metadata and updates the station's stored copy if it's different — so fixing or improving an entry reaches everyone who already added that station, not just new additions. Verified: a station preseeded with a deliberately wrong `nowPlaying` config corrects itself in storage the moment it connects, and the corrected source is used immediately in that same session.
- The full station directory (241 countries) was built from Radio Browser and committed; other countries' stations haven't been individually stream-tested.

## Later

- **More themes.** Pick one from a list, each with its own settings.
- **Buffering and rewind (C-18).** Rewinding a live stream means the app keeps its own copy of the last few minutes of audio. That is possible only for streams that allow CORS (not all do), and support on iPhone is uncertain. It needs a test before it is promised.
- **More now-playing sources (C-14).** Kan 88, pending real-browser confirmation from the deployed origin. Kan Bet and Kan Gimmel likely use the same API with a different `channelId`, untested. Galgalatz and Galei Tzahal: no known source yet — would need a server-side proxy if one's never found, since ICY doesn't work for them either.
- **Crowdsourced now-playing sources.** Right now you add entries to a country's `directory/<CODE>_metadata.json` by hand. Down the road, letting people suggest sources for stations they know (a PR to that file, or something more direct) would grow coverage without you finding every one yourself — not designed yet.
- **A checksum per country's now-playing metadata**, so it's possible to tell at a glance whether a `directory/<CODE>_metadata.json` has actually changed (useful once there are enough countries/entries that eyeballing a diff isn't practical) — not designed yet.

## Milestones

1. **Directory script.** `build_directory.py`, first run, commit `directory/`. ✅ Done — 241 countries.
2. **Core + Evia.** Stations database, language file, import/export, Stations panel (reorder, drag-out removal, remove all, per-station skip toggle), consolidated search (my country / a country), next/previous with wraparound and skip, auto-advance on removing the current station, last station, autostart with graceful fallback, rate-limited playback attempts, media session that survives pausing, media keys. Runs on the local server. ✅ Done.
3. **Song titles.** ICY doesn't work for any test station (see "What testing has shown"); per-station now-playing sources do. ✅ Done for Eco 99. Kan 88 pending confirmation; other stations pending a known source.
4. **GitHub Pages + Android.** Publish, then test background playback and Bluetooth/car controls on your phone.
5. **Rewind test.** Try buffering on the streams that allow it.
6. **Second theme.**
