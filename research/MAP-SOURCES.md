# Base-map sources

Current version 1.15.0 uses Natural Earth 1:50m through the pinned `world-atlas@2.0.2` distribution. The locally bundled asset is `public/maps/world-50m.geojson` (241 features), shared by the globe texture, SVG map, and land mask. Source URLs, complete ISC notice, public-domain geographic terms, hashes, and date-line normalization are recorded in `public/maps/world-50m.NOTICE.md`. The geographic mask uses 8192 × 4096 cells without the previous inward erosion. The asset is reproduced by `research/qa/prepare-world-50m.mjs`; audit results are in `research/qa/COASTAL-MAP-2026-09-21.md`.

## Previous 1:110m asset, preserved for historical tests

- Dataset: Natural Earth, Admin 0 Countries, 1:110m.
- Original download: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
- Repository: https://github.com/nvkelso/natural-earth-vector
- Retrieved: 2026-09-14.
- Local file: `public/maps/world-110m.geojson` (177 features).
- Processing: original Polygon/MultiPolygon coordinates are retained. Only `name` (NAME_EN / NAME) and `iso_a3` (ADM0_A3) properties are retained. Whitespace and unrelated metadata were removed, reducing the file from 838,726 bytes to approximately 254 KB.
- License: Natural Earth states that all versions of its raster and vector map data are in the public domain. https://www.naturalearthdata.com/about/terms-of-use/
- Geography: this is a small-scale cartographic display, not a boundary or jurisdiction reference. Brewery locations come from the separate brewery data file, not from country centroids.

The globe texture is generated locally in the browser from this bundled GeoJSON. It uses hand-selected colors, a generated graticule, and subtle procedural grain. No third-party map requests, API keys, remotely hosted globe textures, or tracking calls are needed at runtime. The same geometry supports the interactive 2D SVG fallback when WebGL 2 is unavailable.

Visualization packages: `react-globe.gl` (MIT) and Three.js (MIT). API reference: https://github.com/vasturiano/react-globe.gl
