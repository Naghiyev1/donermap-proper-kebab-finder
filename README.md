# DonerMap v1.0 — Proper Kebab Finder

A nearby kebab finder with your own quality log.

## What it does

- Uses your current location
- Finds nearby kebab / döner / shawarma / Turkish / Middle Eastern places via OpenStreetMap Overpass
- Shows distance
- Opens walking directions in Apple Maps on iPhone, Google Maps elsewhere
- Lets you save favourites
- Lets you add your own verdict:
  - Proper stacked meat
  - Probably pressed/minced
  - Good overall
  - Avoid
- Lets you add notes and tags:
  - real lamb
  - stacked meat
  - pressed cone
  - good bread
  - bad sauce
  - late-night safe

## Important limitation

There is no reliable global map field for “proper stacked meat vs pressed/minced cone.”

The app finds candidates. Your notes make it accurate over time.

## Data sources

- Leaflet for map UI
- OpenStreetMap tiles
- Overpass API for POI search

## Upload

Upload these files to your repo root:

- index.html
- app-v1-0.js
- style-v1-0.css
- app.js
- style.css
- icon.svg
- manifest.json
- service-worker.js
- README.md


## v1.1 — Distance + Directions Fix

Fixes:
- Distance label now says whether it is from you or from the search point
- Distance clearly marked as straight-line estimate
- If GPS is available, distances are calculated from your actual location
- Directions explicitly start from Current Location
- Added Apple Maps / Google Maps selector
- Added route note in place drawer
- Cache bumped to v1.1
