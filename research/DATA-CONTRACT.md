# Demo data contract

Write JSON as `{ "breweries": [...], "beers": [...] }`.

Brewery: `id`, `name`, `nameZh`, `country` (English), `countryZh`, `city`, `lat`, `lng`, `locationPrecision` (`brewery` or `city`), `year` (number or null), `website`, `description` (short Chinese, sourced summary), `sourceUrls` (array URLs).

Beer: `id`, `name`, `breweryId`, `style` (English), `styleZh`, `abv` (number or null), `ibu` (number or null), `srm` (number or null), `description` (Chinese sourced summary, or original English for expanded archive entries with explicit sourceNote), `originalDescription`, `flavors` (Chinese array drawn from the description; preferably 柑橘/热带水果/松针/焦糖/烘烤/咖啡/巧克力/花香/麦香/香料/清爽/莓果/酸爽), `hops` (array), `malts` (array), `yeast` (string or null), `foodPairings` (array, only when sourced), `firstBrewed` (string or null), `image` (local URL `/images/...`), `imageCredit` (string with author/license), `imageSource` (URL), `sourceUrls` (array URLs), `sourceNote` (brief Chinese), `collection` (`world` or `archive`).

Missing = null or [], never made up. Every beer must have at least a meaningful sourced description/flavors and usable actual image; generic archive keg icons may be omitted by choosing other beers. No scores or numerical sensory profiles inferred. Brewery locations must belong to the real brewery; mark city precision if only city centre is verified. Descriptions can be original concise translations/summaries, not wholesale reproduction of webpages.

Save downloaded media in public/images for actual local webapp use; record all provenance. Downloading assets for the requested offline demo is authorized. Do not sign up for services; record blockers in your research markdown. Limit to a bounded, useful dataset and verify image HTTP/content signatures.

## Version 1.1 additions

Archive records may carry sourceRecord, flavorEvidence and dataQualityFlags. Empty flavors are valid when no explicit supported keyword is present; keep the source description and identify that no tags have been extracted. Do not infer flavor from the hop name alone. Retain verified numeric zeros such as source IBU=0 while unknown remains null. Brand headquarters can be mapped as a clearly identified city reference, never silently presented as the physical production site of every beer.

## Version 1.2: free historical catalog test layer

The user's request to continue testing a free larger database authorizes a separate `collection: "openbeer"` layer. Existing world/archive photo quality requirements remain. OpenBeer may have `image`, `imageSource`, and numeric parameters set to null, empty descriptions and empty flavor arrays when the source lacks them. The UI must explicitly show missing photos and historical provenance instead of manufacturing them.

Preserve source IDs, source timestamps, source country labels and deduplication evidence. Record `craftStatus: "unknown"`; do not count these as independently verified distinct craft beers. Zero-valued OpenBeer parameters are missing-value sentinels, distinct from sourced zero IBU values in the earlier archive.

Historical coordinates use `locationPrecision: "historical"` and `locationRole: "historical_brewery_reference"`. Missing or conflicting coordinates remain null. Unmapped records are searchable in the library; only valid coordinates enter the globe or mapped brewery count. Country/region counts use breweries referenced by records, not empty breweries in the source dump.

Retain the source CSVs, the source README and ODbL / DbCL attribution alongside the derived catalog. The free source does not supply bottle photographs, certify craft status, or establish contemporary worldwide completeness.

## Version 1.3: actual OFF product photographs

Add `collection: "off"` as a separate photo catalog; do not alter the three older source files. Every imported OFF group must have an actually downloaded JPEG, a selected-front-to-original-image-id relationship, uploader attribution, source barcode(s), source URLs and CC BY-SA 3.0 information. A public source's URL field alone is not proof of a usable photo. Original selected-front source photos may show a bottle, can, label area or retail packaging; they are not transparent studio cutouts.

The source must explicitly include the exact `en:beers` category; reject root-beer confectionery and unrelated food. Group exact brand + normalized explicit product names only, removing unambiguous packaging quantities. Reject unresolved generic identity, conflicting ABV groups and duplicate image bytes pending review. Keep `craftStatus: "unknown"` even when a source category labels a product as craft. Empty ABV, IBU and flavor fields remain null/empty.

Reuse an existing source-backed brewery ID only after a conservative brand match. `locationEvidence` must state `productionLocationVerified: false`, `salesCountriesUsed: false` and retain its source brewery and URLs. Historical reference coordinates remain historical. New unresolved brand nodes have null coordinates and country; they can appear in the photo library but not on the globe.

The default `pictured` virtual collection is the union of records with actual supplied images across sources. Users can still explicitly choose the unpictured historical catalog. All-source totals are record counts, not a verified number of distinct craft beers.
