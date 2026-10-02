# Soft atlas shaded-relief basemap

Relief: **Natural Earth Gray Earth with Shaded Relief, Hypsography and Flat Water v3.2.0**, public domain.

- Source: https://naturalearth.s3.amazonaws.com/10m_raster/GRAY_LR_SR_W.zip
- Terms: https://www.naturalearthdata.com/about/terms-of-use/
- Coastlines and borders: the bundled Natural Earth 1:50m geometry.

The original relief is recolored with a muted neutral atlas palette and blue oceans. A heavily smoothed historic NASA Blue Marble July 2004 image guides subtle sand and snow tints; it is not displayed as a photographic texture and is not an authoritative land-cover classification.

- NASA palette guide: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg
- NASA source page: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/
- NASA reuse information: https://science.nasa.gov/earth/faq/

This is shaded raster relief, not current satellite imagery, weather, agricultural zoning, or displaced 3D terrain. NASA does not endorse this project.

Reproduce with `scripts/build-terrain-texture.py`; source and generated hashes are recorded in `earth-terrain.json`. Locally bundled textures: 2048 px / 117,068 bytes for phones, 4096 px / 371,782 bytes for desktops.

`earth-land-8192.bin.gz` is a lossless packed representation of the same 1:50m land/water raster used for bottle placement. `scripts/build-geographic-land.mjs` verifies all 33,554,432 cells before writing it. It changes startup transfer and computation only, not coastline resolution. Provenance and dimensions are in `earth-land-8192.json`.

## On-demand close-up detail

The actual original Natural Earth relief raster is **16200 × 8100**, not 2048 pixels. `scripts/build-detailed-terrain-texture.py` derives an **8192 × 4096** WebP (1,286,068 bytes) from that original raster with the same muted atlas color stops, blue ocean, softly blended NASA sand/snow tint and 1:50m border geometry. No artificial terrain is invented or existing 2K texture enlarged. The historic NASA color guide is 5400 × 2700; the fine relief comes from Natural Earth.

Initial requests remain 2048 × 1024 on compact devices and 4096 × 2048 on desktop. `makeDetailedTerrainTexture` is an optional near-view upgrade: 4K mobile / 8K desktop, capped by reported WebGL maximum texture size and available device-memory hints. Keep the initial texture visible until the replacement decodes and uploads. A failed detailed request may return the caller's existing fallback URL. This upgrades raster detail only; coastlines and country geometry remain Natural Earth 1:50m. Source files, dimensions and derivative hashes remain in `earth-terrain.json`.
