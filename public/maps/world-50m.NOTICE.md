# World geography — Natural Earth 1:50m

`world-50m.geojson` is a geographic rendering asset, independent of the beer catalog. It contains 241 country/territory features. It provides generalized coastlines; city reference coordinates remain unchanged and are not exact brewery addresses.

## Sources and rights

- Original fixed-version TopoJSON: https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json
- Maintainer repository and build documentation: https://github.com/topojson/world-atlas
- Geographic source: Natural Earth 4.1.0, 1:50 million countries, as documented by world-atlas.
- Natural Earth terms: https://www.naturalearthdata.com/about/terms-of-use/ — the geographic data is in the public domain; copying, modification, redistribution, and commercial use do not require permission.
- world-atlas distribution license: ISC, https://github.com/topojson/world-atlas/blob/master/LICENSE. The complete notice is retained below.
- Source downloaded 2026-09-20T19:02:39.416Z over a normal public HTTP GET (200).

## Reproduction and integrity

- Source bytes: 756,420
- Source SHA-256: `04342cdc1e3016bcd7db1630de95684d67b79fe3c8c460321e87aef469502394`
- Output bytes: 3,939,065
- Output SHA-256: `96652f04de92088f1ad759d0c03541ea5235061b060aa3147693fd5812a039c7`
- Prepared at: 2026-09-20T19:11:17.165Z
- Reproduction: `node research/qa/prepare-world-50m.mjs` from the project root, using the preserved source `research/qa/world-atlas-countries-50m.topo.json` and the project's existing `topojson-client` / `d3-geo` dependencies.

The conversion uses `topojson-client.feature`. Russia, Fiji, and Antarctica contain spherical rings crossing the date line; these three features are passed through standard `d3-geo` antimeridian clipping with resampling disabled (`precision(0)`), then exterior rings and holes are regrouped into valid polygons. This adds date-line intersections and closure edges without simplifying the source coastlines or adding islands. The other 238 features retain the direct TopoJSON conversion. There are no remaining non-horizontal edges that jump across more than 180 degrees of longitude. Horizontal polar closure edges are intentional.

The app uses this same asset for geographic masking and map rendering. The intended mask is 8192 × 4096 with `coastMargin: 0`; this removes the old inward erosion, and does not expand land into water. Pixel rectangle checks and land-path constraints remain separate application safeguards.

## ISC notice

```text
Copyright 2013-2019 Michael Bostock

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```
