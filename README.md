# estate-salesman-map

Simple Leaflet app for searching POIs around a chosen location.

## Run locally

Do not open `index.html` directly via `file://`.
Run a local HTTP server instead:

```bash
# Python 3
python -m http.server 5500
```

Then open:

http://localhost:5500

## Note about map tiles

The app uses CARTO basemaps (with OSM data attribution) to avoid the
"Access blocked / Referer is required" error that can appear with direct
usage of `tile.openstreetmap.org` in browser demos.