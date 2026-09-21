#!/usr/bin/env python3
"""Builds directory/ from Radio Browser (C-10a).

Run by hand, then commit the resulting directory/ files:

    python tools/build_directory.py

Fetches every station from the Radio Browser API, grouped by country code;
keeps only stations that passed their last check and have an https:// stream;
removes duplicates (same stream URL); writes directory/countries.json and
directory/<CODE>.json.
"""
import datetime
import json
import pathlib
import sys
import urllib.request

API_BASE = "https://de1.api.radio-browser.info/json"
USER_AGENT = "MyRadio/1.0 (https://github.com/; personal live-radio player)"
OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "directory"


def fetch_all_stations():
    """Fetches every station Radio Browser knows about, in one paged sweep."""
    stations = []
    offset = 0
    limit = 5000
    while True:
        url = f"{API_BASE}/stations/search?limit={limit}&offset={offset}&hidebroken=true"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req) as res:
            batch = json.load(res)
        if not batch:
            break
        stations.extend(batch)
        offset += limit
        if len(batch) < limit:
            break
    return stations


def keep(station):
    if not station.get("lastcheckok"):
        return False
    url = station.get("url_resolved") or station.get("url") or ""
    return url.startswith("https://")


def to_entry(station):
    return {
        "name": station.get("name", "").strip(),
        "urls": [station.get("url_resolved") or station.get("url")],
        "tags": [t.strip() for t in (station.get("tags") or "").split(",") if t.strip()],
        "city": station.get("state") or "",
        "codec": station.get("codec") or "",
        "bitrate": station.get("bitrate") or 0,
        "logo": station.get("favicon") or None,
        "votes": station.get("votes") or 0,
    }


def dedupe_by_url(entries):
    seen = set()
    unique = []
    for e in entries:
        url = e["urls"][0]
        if not url or url in seen:
            continue
        seen.add(url)
        unique.append(e)
    return unique


def main():
    print("Fetching stations from Radio Browser...", file=sys.stderr)
    raw = fetch_all_stations()
    print(f"Fetched {len(raw)} stations total.", file=sys.stderr)

    by_country = {}
    for station in raw:
        if not keep(station):
            continue
        code = (station.get("countrycode") or "").strip().upper()
        if not code:
            continue
        by_country.setdefault(code, []).append(station)

    built_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    country_names = {}
    countries_index = []
    for code, stations in sorted(by_country.items()):
        entries = dedupe_by_url([to_entry(s) for s in stations])
        if not entries:
            continue
        name = stations[0].get("country") or code
        country_names[code] = name
        countries_index.append({"code": code, "name": name, "count": len(entries)})
        (OUT_DIR / f"{code}.json").write_text(
            json.dumps({"code": code, "name": name, "builtAt": built_at, "stations": entries},
                       ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    (OUT_DIR / "countries.json").write_text(
        json.dumps({"builtAt": built_at, "countries": countries_index}, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"Wrote {len(countries_index)} country files to {OUT_DIR}", file=sys.stderr)


if __name__ == "__main__":
    main()
