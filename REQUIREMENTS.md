# Radio player: requirements

Draft v0.4, 21 September 2026

## Goal

A personal live-radio player for desktop and phone. Your station list lives in the browser and moves between devices by export/import. The app's look can be swapped: several looks share one core, and the first look is called **Evia**.

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

## Core requirements (all looks)

### Stations database

- **C-1** Your stations live in the browser's local storage, in the **stations database**. Nothing is built in: on first open the list is empty.
- **C-2** The stations database also stores the last station played. It is used to restore that station next time and is never exported.
- **C-3** Remove stations one at a time, or all at once after a confirmation.
- **C-4** Next/previous wrap around: next on the last station goes to the first, previous on the first goes to the last.

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
  - writes `directory/countries.json` (code, name, station count) and `directory/<CODE>.json` per country
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

Sizes: Israel is about 200 stations (~50 KB). The largest country, the US, is several thousand (~2 MB).

### Languages

- **C-10e** Every piece of text the app shows (buttons, messages, labels, tooltips) comes from a language file, `lang/en.json`. English is the only language for now; adding one means adding a file.
- **C-10f** Language is a core setting shared by all looks, stored in the UI database.

### Playback

- **C-11** Playback continues in the background: other tab, minimized window, phone screen locked.
- **C-12** Responds to play/pause, next and previous from keyboard media keys, headphones, the phone lock screen and Bluetooth (for example, car controls).
- **C-13** Each station can have several stream URLs. If one fails the app tries the next, and after a drop mid-stream it reconnects. Errors say what was tried. *(Built in the prototype.)*
- **C-14** Shows what is playing (artist and title) where the station makes it available. Which stations do, and whether any need a server, is the next test.

### Looks

- **C-15** The app has several looks, listed in the app's own code (not in your local storage). Evia is the first.
- **C-16** Your settings for the app are stored separately from the stations, in the **UI database**. It holds the chosen look plus a separate settings section for each look, so switching looks never mixes their settings.
- **C-17** Every look must offer at least:
  - switching to another look
  - next and previous station
  - adding and removing stations
- **C-18** *(Later)* Buffering and rewind of the live audio, switched on per look. Needs a feasibility test first; see "Later".

## Evia (first look)

- **E-1** Futuristic blue styling.
- **E-2** Top line, left to right: **previous** icon, the **station name box** (a dropdown of your stations), **play/pause** icon, **next** icon. Previous/next switch to the previous/next station in your list.
- **E-3** Second line: what is playing, when available.
- **E-4** Below the two lines, small icons:
  - **Tools** opens your station list. Drag a station by its handle (≡) to reorder. Dragging a station out of the list asks "Remove this station?" (Yes/No). Also holds **Remove all**.
  - **Search my country** opens the directory for your default country, with the regular expression filter (C-10d). Tapping a result adds it to your list.
  - **Search a country** first asks for a country (itself filterable), then shows the same search for that country. Here you can also make it your default country.
  - **Settings** holds import, export and the look switcher.
- **E-5** Empty state: with no stations, the top line invites you to search for stations.

## Stored data

| Store | Key | Contents | Exported |
|---|---|---|---|
| Stations database | `radio.stations` | Stations in your order, default country, last station played | Stations and default country |
| UI database | `radio.ui` | Language, active look, per-look settings (`looks.evia`, ...) | No |

Files published with the app (on GitHub):

| Path | Contents |
|---|---|
| `directory/countries.json` | Countries with station counts, build date |
| `directory/<CODE>.json` | Stations in one country |
| `lang/en.json` | All app text in English |
| `looks/evia/` | Evia's markup, styles and settings defaults |
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
      "logo": "https://..."
    }
  ]
}
```

Import also accepts a bare list of stations (`[ {...}, {...} ]`).

## Working decisions (change any of them)

1. **Default country** is stored with your stations and exported, so a new device picks it up on import.
2. **Choosing a station** in the dropdown or with next/previous starts playing it when something is already playing. When stopped, it only selects.
3. **Adding a station** that is already in your list (same stream URL) does nothing except say so.
4. **The directory is rebuilt by hand.** A GitHub Action could run the script weekly instead; that is a later option.

## What testing has shown (21 September 2026)

- All 7 test stations play from your PC in Edge: Eco 99, Galgalatz, Galgalatz Rock, Galei Tzahal, Kan Bet, Kan 88, Kan Gimmel.
- `eco-live.mediacast.co.il` plays normally but fails in CORS mode.
- The preview pane inside the Claude app blocks these streams. Test in Edge or Chrome.
- Not yet checked: which stations publish song titles in a way a browser can read.

## Later

- **More looks.** Pick one from a list, each with its own settings.
- **Buffering and rewind (C-18).** Rewinding a live stream means the app keeps its own copy of the last few minutes of audio. That is possible only for streams that allow CORS (not all do), and support on iPhone is uncertain. It needs a test before it is promised.
- **Song titles via a server,** only for stations the browser can't read.

## Milestones

1. **Directory script.** `build_directory.py`, first run, commit `directory/`.
2. **Core + Evia.** Stations database, language file, import/export, Tools panel (reorder, drag-out removal, remove all), both searches, next/previous with wraparound, last station, media keys. Runs on the local server.
3. **Song titles.** Test each station's title source, then show titles in the second line and on the lock screen.
4. **GitHub Pages + Android.** Publish, then test background playback and Bluetooth/car controls on your phone.
5. **Rewind test.** Try buffering on the streams that allow it.
6. **Second look.**
