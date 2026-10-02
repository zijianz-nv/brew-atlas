# Celestial positions and constellation figures

Checked 2026-10-02. The module contains 147 plotted star entries across the twelve traditional zodiac figures. These are actual J2000 equatorial coordinates, not decorative circle positions. Right ascension is stored in degrees (divide by 15 for hours); declination is north-positive degrees. No current-date precession, location-dependent horizon, camera view or real planet-to-star alignment is computed. The astronomical ecliptic also crosses Ophiuchus; the selected twelve figures are not a claim that the ecliptic has only twelve constellations or equally sized astrological sectors.

Source: [ofrohn/d3-celestial](https://github.com/ofrohn/d3-celestial/tree/7e720a3de062059d4c5400a379146a601d9010e0), pinned revision `7e720a3de062059d4c5400a379146a601d9010e0`.

- `data/stars.6.json`: XHIP, Anderson E. and Francis C. (2012), [VizieR V/137D](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/137D), as converted to J2000 GeoJSON by d3-celestial.
- `data/constellations.lines.json`: conventional star-figure connections; upstream credits IAU constellation charts and some modifications by Olaf Frohn. Such stick figures are illustrative choices, not official constellation boundaries.
- `data/constellations.json`: Latin/IAU constellation names and upstream editorial label anchors.
- `data/starnames.json`: upstream proper names and Hipparcos cross-identifications; root README retains the catalog attribution chain.
- [Upstream coordinate format](https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/data/readme.md) and [source/epoch documentation](https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/readme.md).

Converted longitudes from −180…180 degrees to RA 0…360 degrees without changing celestial location. Line endpoints were joined to the star catalog; 146 exactly match, while Cancer's Iota endpoint was matched to HIP 43103 within 0.0093 degrees and the catalog coordinate retained. Every vertex uses its matched catalog coordinate. The research folder records exact input hashes and this adjustment.

Projection: a continuous all-sky equirectangular atlas, RA horizontally, declination vertically. Default orientation has north up and increasing RA to the left. The 0h seam is split to avoid spurious full-width lines. A 2:1 canvas keeps equal degree scale; other aspect ratios stretch the atlas. Connecting segments are conventional straight atlas lines, not physical stellar connections. All constellations share one frame, without independent scaling or ring placement. Libra and Scorpius may have brighter stars; their names use the same label styling as the others.

Copyright (c) 2015, Olaf Frohn. Distributed and adapted under BSD-3-Clause. The complete license is preserved in [d3-celestial-LICENSE.txt](./d3-celestial-LICENSE.txt). Retain this notice and the license in distributions. The star catalog and IAU source attributions above remain applicable; no endorsement is implied.
