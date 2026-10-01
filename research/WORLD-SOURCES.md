# World demo data: provenance and limitations

Verified on 2026-09-14. 22 brewery/brand records, 31 beer records, 13 countries. Original 12 beers and 10 breweries retained; second pass adds 19 beers, 12 breweries/brands and 6 countries. No account was created, no registration, no paid API or secret is required. Assets are bundled for offline operation.

## What this collection means

- A bounded world beer/style collection for testing, not an exhaustive global database, an independence certification, an in-stock inventory, or a recommendation ranking.
- Guinness and Pilsner Urquell are explicitly marked as style reference examples. Other brands are not represented as holding a craft certification.
- Descriptions are short original Chinese summaries of linked producer pages; Nøgne Ø uses the Norwegian state retailer Vinmonopolet’s product tasting and Colorado Appia uses the brand distributor Rizatti. `originalDescription` contains a short source-language excerpt. Flavor tags are descriptive terms from those pages; they are not laboratory measurements or a sensory score.
- Numeric parameters follow the named product/market version. Missing values are null. No estimated ratings, prices, coordinates or synthetic flavor radar values.
- Product photographs may show historical packaging and are not evidence of current availability.

## Free sources used and skipped

- Producer public product pages: beer facts and short sourced summaries; no registration.
- Wikimedia Commons API: photographs and image author/license metadata; no registration.
- Wikipedia coordinate API: brewery article coordinates. These are reference locations, not guaranteed production origin of every bottle. Kiuchi and Stone are explicitly marked `locationPrecision: city` with municipal coordinates.
- Catalog.beer API: skipped because it needs registration/an API key; official pages replace the sample facts. No key requested.
- Untappd / Pint Please / BeerTasting commercial data: skipped because access/licensing requires account or supplier agreement.
- Open Food Facts: not needed for this bounded sample because corresponding openly licensed Commons photographs were available.
- Hitachino old `hitachino.cc` product URL was unavailable; the current producer site `kiuchibrewery.co.jp` supplies the beer facts.
- Little Creatures image search did not yield a confidently matched licensed product photograph within the time bound. Coopers provides the Australian example.

## Rights

The Chinese summaries are newly written; underlying short facts are attributed to the linked pages. Do not assume the entire producer website or all its imagery has an open license. All photos actually bundled in this collection use the specific Commons licenses below. CC BY requires attribution; CC BY-SA also requires retaining share-alike terms for adaptations of the photo. CC0 items are public-domain dedications. Brand marks remain subject to applicable trademark rights. Images are downloaded as Commons thumbnails; they have not been otherwise altered.

## Beer sources and image credits

| Beer | Producer facts | Local photo / Commons source | Author and license | License URL |
|---|---|---|---|---|
| Sierra Nevada Pale Ale | [Source 1](https://sierranevada.com/brews/pale-ale) | [/images/world-sierra-pale.jpg](https://commons.wikimedia.org/wiki/File:Sierra_Nevada_Pale_Ale_(cropped).jpg) | SteveR · CC BY 2.0 | [License](https://creativecommons.org/licenses/by/2.0) |
| Duvel | [Source 1](https://www.duvel.com/en/the-beer/duvel) | [/images/world-duvel.jpg](https://commons.wikimedia.org/wiki/File:Duvel..jpg) | Andreador · CC BY 3.0 | [License](https://creativecommons.org/licenses/by/3.0) |
| Chimay Blue / Grande Réserve | [Source 1](https://chimay.com/wp-content/uploads/2020/12/6299-Communique%CC%81-de-presse-EN.pdf)<br>[Source 2](https://chimay.com/cadeaux/?lang=en) | [/images/world-chimay-blue.jpg](https://commons.wikimedia.org/wiki/File:Chimay_bleu.jpg) | Ludovic Péron · CC BY-SA 3.0 | [License](https://creativecommons.org/licenses/by-sa/3.0) |
| Chimay Red / Première | [Source 1](https://chimay.com/wp-content/uploads/2020/12/6299-Communique%CC%81-de-presse-EN.pdf) | [/images/world-chimay-red.jpg](https://commons.wikimedia.org/wiki/File:Chimay_Rouge.JPG) | LeeKeoma · CC0 | [License](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| Weihenstephaner Hefeweißbier | [Source 1](https://www.weihenstephaner.de/unsere-biere/hefeweissbier) | [/images/world-weihen-hefe.jpg](https://commons.wikimedia.org/wiki/File:Weihenstephaner_Hefe_Weissbier.JPG) | LeeKeoma · CC0 | [License](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| Weihenstephaner Hefeweißbier Dunkel | [Source 1](https://www.weihenstephaner.de/en/our-beers/dark-wheat-beer-1) | [/images/world-weihen-dunkel.jpg](https://commons.wikimedia.org/wiki/File:Weihenstephaner_Hefeweissbier_Dunkel.JPG) | LeeKeoma · CC0 | [License](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| Guinness Draught | [Source 1](https://www.guinness.com/en-gb/beers/guinness-draught) | [/images/world-guinness.jpg](https://commons.wikimedia.org/wiki/File:Guinness_Draught.jpg) | FakirNL · CC BY-SA 3.0 | [License](https://creativecommons.org/licenses/by-sa/3.0) |
| Pilsner Urquell | [Source 1](https://www.pilsnerurquell.com/)<br>[Source 2](https://www.asahideutschland.de/unsere-marken/pilsner-urquell) | [/images/world-urquell.jpg](https://commons.wikimedia.org/wiki/File:Pilsner_Urquell_330mL_Bottle.jpg) | Latterdaystan · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Lindemans Kriek | [Source 1](https://lindemans.be/fr-be/pages/lindemans-kriek) | [/images/world-lindemans-kriek.jpg](https://commons.wikimedia.org/wiki/File:Lindemans_-_Kriek_%2B_bottle_Studio_Wauters_LR_02.jpg) | Strangerhappenings · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Hitachino Nest Red Rice Ale | [Source 1](https://kiuchibrewery.co.jp/en/products/beer/list/red-rice-ale/) | [/images/world-hitachino-red.jpg](https://commons.wikimedia.org/wiki/File:Hitachino_Red_Rice_Ale_(2970235314).jpg) | Ryan Snyder · CC BY 2.0 | [License](https://creativecommons.org/licenses/by/2.0) |
| Coopers Original Pale Ale | [Source 1](https://coopers.com.au/products/original-pale-ale) | [/images/world-coopers-pale.jpg](https://commons.wikimedia.org/wiki/File:COOPERS_PALE_ALE_FROM_ADELAIDE_AUSTRALIA_IN_THE_BIER_GARDEN_SAIGON_VIETNAM_JAN_2012_(6964050205).jpg) | calflier001 · CC BY-SA 2.0 | [License](https://creativecommons.org/licenses/by-sa/2.0) |
| Stone ///Fear.Movie.Lions Hazy Double IPA | [Source 1](https://www.stonebrewing.com/beer/year-round-releases/stone-fearmovielions-hazy-double-ipa) | [/images/world-stone-fml.jpg](https://commons.wikimedia.org/wiki/File:Fear.Movie.Lions_IPA.jpg) | BBQboffin · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |

## Map locations

| Brewery | Precision | Coordinates | Source |
|---|---|---|---|
| Sierra Nevada Brewing Co. | brewery | 39.72333333, -121.81583333 | [Coordinate reference](https://en.wikipedia.org/wiki/Sierra_Nevada_Brewing_Company) |
| Duvel Moortgat | brewery | 51.041996, 4.32871 | [Coordinate reference](https://en.wikipedia.org/wiki/Duvel_Moortgat_Brewery) |
| Chimay Brewery | brewery | 49.98194444, 4.3375 | [Coordinate reference](https://en.wikipedia.org/wiki/Chimay_Brewery) |
| Bayerische Staatsbrauerei Weihenstephan | brewery | 48.39611111, 11.72916667 | [Coordinate reference](https://en.wikipedia.org/wiki/Bayerische_Staatsbrauerei_Weihenstephan) |
| Guinness · St. James’s Gate | brewery | 53.34444444, -6.28888889 | [Coordinate reference](https://en.wikipedia.org/wiki/Guinness_Brewery) |
| Pilsner Urquell Brewery | brewery | 49.74666667, 13.38722222 | [Coordinate reference](https://en.wikipedia.org/wiki/Pilsner_Urquell_Brewery) |
| Lindemans Brewery | brewery | 50.81579, 4.21229 | [Coordinate reference](https://en.wikipedia.org/wiki/Lindemans_Brewery) |
| Kiuchi Brewery · Hitachino Nest | city | 36.45738889, 140.48675 | [Coordinate reference](https://en.wikipedia.org/wiki/Naka,_Ibaraki) |
| Coopers Brewery | brewery | -34.8726, 138.5731 | [Coordinate reference](https://en.wikipedia.org/wiki/Coopers_Brewery) |
| Stone Brewing | city | 33.12472222, -117.08083333 | [Coordinate reference](https://en.wikipedia.org/wiki/Escondido,_California) |

## Reproduce and verify

Run `python3 scripts/collect-world.py`, then `python3 scripts/expand-world.py` from this project. The first command restores the original 12-record base; the second idempotently adds the geographic expansion. It refreshes Commons image attribution and writes `public/data/world.json`; existing bundled images are retained. Add `--refresh-images` to download the source thumbnails again. The script uses only the Python standard library and public HTTPS endpoints.

The original 12 downloaded images were checked for JPEG/PNG signatures and opened for visual inspection. Each photo matches the intended named beer; Guinness shows the matching Draught-branded glass, Stone shows the matching beer name on the back label. All brewery foreign keys, required fields and local file paths were verified.

Potential production improvement: replace historical packaging with current licensed manufacturer cutouts after the data supplier review. Improve factory precision for Kiuchi and Stone before adding street-level directions.

## Geographic expansion (2026-09-14)

Added Canada, Netherlands, Norway, Denmark, Brazil and Sweden. Added product imagery is bundled from Commons and was opened locally to verify the named product. No account, secret, subscription or paid API was used. The expansion script keeps original records and merges by stable IDs.

### Version and location caveats

- Mikkeller and Omnipollo markers represent brand locations, not production provenance. Mikkeller Beer Geek Breakfast has been made by partner breweries; the linked 2017 can announcement names Lervig in Norway. Omnipollo’s Marbles page explicitly says De Proefbrouwerij in Belgium. Both are city precision and this distinction is in the visible record descriptions. Country totals count brewery/brand locations.
- Unibroue’s Commons filename says “La Fin Du Monde”, but the inspected label says “Ce n’est pas La Fin du Monde”, 9.5%. The record uses that actual Belgian IPA and its corresponding producer page. It must never be silently relabeled as the classic 9% Tripel.
- ’t IJ IPA’s historical image reads 7%; current producer facts read 6.5%. Colorado Appia’s historical photo description references 4.5%; current distributor facts read 5.5% and 10 IBU. Both retain explicit version notes. Nøgne Ø Saison uses the current Vinmonopolet 6.5% record.
- All missing parameters remain null. La Trappe EBC and St. Bernardus EBC/EBU are not automatically converted into SRM/IBU. No user ratings or made-up scores were added.
- Omnipollo Marbles has three named hops and a short easy-drinking producer description; no specific fruit aroma was inferred merely from hop names.
- `File:Saison Dupont.jpg` reports “Public domain” as its metadata’s preferred license, but the same file’s Permission field explicitly grants CC BY-SA 3.0. The fixture retains that named license option and author Jmcstrav. `File:Saison.jpg` was rejected because the inspected bottle was Biolégère, a different product.
- Mikkeller Ris a la M’ale was dropped: its available licensed photograph showed only an unmarked glass, making it unsuitable for the product-bottle map. No generic image substitutes were used.

### Added beer facts and images

| Beer | Facts | Image | Author/license | License URL |
|---|---|---|---|---|
| Unibroue Ce n’est pas La Fin du Monde | [Source 1](https://www.unibroue.com/en-ca/beers/classics/ce-nest-pas-la-fin-du-monde) | [/images/world-unibroue-fin-monde.jpg](https://commons.wikimedia.org/wiki/File:Tallboy_can_of_La_Fin_Du_Monde_by_Unibroue.jpg) | Gogerr · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Unibroue Maudite | [Source 1](https://www.unibroue.com/en-us/beers/classics/maudite) | [/images/world-unibroue-maudite.jpg](https://commons.wikimedia.org/wiki/File:Tallboy_can_of_%22Maudite%22_by_Unibroue.jpg) | Gogerr · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Unibroue Blanche de Chambly | [Source 1](https://www.unibroue.com/en-us/beers/classics/blanche-de-chambly) | [/images/world-unibroue-blanche.jpg](https://commons.wikimedia.org/wiki/File:Can_of_Blanche_Chambly_by_Unibroue.jpg) | Gogerr · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| La Trappe Quadrupel | [Source 1](https://it.latrappetrappist.com/it/it/le-nostre-birre/prodotti/birra/la-trappe-quadrupel.html) | [/images/world-latrappe-quad.jpg](https://commons.wikimedia.org/wiki/File:Latrappequadrupel.jpg) | Weber Ribeiro · CC BY-SA 3.0 | [License](http://creativecommons.org/licenses/by-sa/3.0/) |
| La Trappe Tripel | [Source 1](https://it.latrappetrappist.com/it/it/le-nostre-birre/prodotti/birra/la-trappe-tripel.html) | [/images/world-latrappe-tripel.jpg](https://commons.wikimedia.org/wiki/File:Latrappetripel.jpg) | Weber Ribeiro · CC BY-SA 3.0 | [License](http://creativecommons.org/licenses/by-sa/3.0/) |
| La Trappe Blond | [Source 1](https://it.latrappetrappist.com/it/it/le-nostre-birre/prodotti/birra/la-trappe-blond.html) | [/images/world-latrappe-blond.jpg](https://commons.wikimedia.org/wiki/File:LaTrappeTrappistBlond.jpg) | Miguel Andrade · CC0 | [License](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| Brouwerij ’t IJ Zatte Tripel | [Source 1](https://www.brouwerijhetij.nl/en/our-beers/zatte-tripel) | [/images/world-ij-zatte.jpg](https://commons.wikimedia.org/wiki/File:%27t_IJ_Zatte_Tripel.jpg) | FakirNL · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Brouwerij ’t IJ IPA | [Source 1](https://www.brouwerijhetij.nl/en/our-beers/ipa) | [/images/world-ij-ipa.jpg](https://commons.wikimedia.org/wiki/File:Brouwerij_%27t_IJ_I.P.A._(old_design).jpg) | Lars van der Heide · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Brouwerij ’t IJ IJwit | [Source 1](https://www.brouwerijhetij.nl/en/our-beers/ijwit) | [/images/world-ij-wit.jpg](https://commons.wikimedia.org/wiki/File:Brouwerij_%27t_IJ_IJwit_(bottle).jpg) | FakirNL · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Nøgne Ø India Pale Ale | [Source 1](https://www.vinmonopolet.no/Land/Norge/N%C3%B8gne-%C3%98-India-Pale-Ale/p/1336802)<br>[Source 2](https://www.nogne-o.no/vare-ol/india-pale-ale) | [/images/world-nogne-ipa.jpg](https://commons.wikimedia.org/wiki/File:Nogne_o_ipa.jpg) | Ras · CC BY-SA 3.0 | [License](https://creativecommons.org/licenses/by-sa/3.0) |
| Nøgne Ø Saison | [Source 1](https://www.vinmonopolet.no/Land/Norge/Agder/Grimstad/N%C3%B8gne-%C3%98-Saison/p/7906702) | [/images/world-nogne-saison.jpg](https://commons.wikimedia.org/wiki/File:Nogne_o_saison.jpg) | Ras · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Mikkeller Beer Geek Breakfast | [Source 1](https://faergekroen.mikkeller.com/drinks)<br>[Source 2](https://www.mikkeller.com/how-it-all-started)<br>[Source 3](https://www.mikkeller.com/news/new-beer-geek-breakfast-can-ready) | [/images/world-mikkeller-breakfast.jpg](https://commons.wikimedia.org/wiki/File:Beergeekbreakfast_glas.jpg) | Dirk Van Esbroeck · CC BY-SA 3.0 | [License](https://creativecommons.org/licenses/by-sa/3.0) |
| Colorado Appia | [Source 1](https://rizatti.com.br/nossas-marcas/cervejas/cervejaria-colorado/colorado-appia) | [/images/world-colorado-appia.jpg](https://commons.wikimedia.org/wiki/File:Colorado_Appia_(8472282044).jpg) | Christian Benseler · CC BY 2.0 | [License](https://creativecommons.org/licenses/by/2.0) |
| Omnipollo Marbles | [Source 1](https://omnipollo.com/products/marbles) | [/images/world-omnipollo-marbles.jpg](https://commons.wikimedia.org/wiki/File:Omnipollo_Marbles.jpg) | JIP · CC BY-SA 4.0 | [License](https://creativecommons.org/licenses/by-sa/4.0) |
| Orval | [Source 1](https://www.orval.be/en/page/447-orval-brewery)<br>[Source 2](https://en.wikipedia.org/wiki/Orval_Brewery) | [/images/world-orval.png](https://commons.wikimedia.org/wiki/File:Orval_beer_bottle_(2011).png) | LeeKeoma edit by Bruce The Deus · CC0 | [License](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| La Chouffe | [Source 1](https://chouffe.com/fr-fr/nos-bieres/la-chouffe) | [/images/world-chouffe.jpg](https://commons.wikimedia.org/wiki/File:La_Chouffe_bottle.jpg) | Marie-Lan Nguyen · CC BY 2.5 | [License](https://creativecommons.org/licenses/by/2.5) |
| Rodenbach Grand Cru | [Source 1](https://www.rodenbach.be/content/dam/rodenbach/het-foederhuis/Foederhuis%20Menu%20-%20ENG.pdf/_jcr_content/renditions/original.media_file.download_attachment.file/Foederhuis%20Menu%20-%20ENG.pdf) | [/images/world-rodenbach-grand.jpg](https://commons.wikimedia.org/wiki/File:Rodenbach_grand_cru_bottle.jpg) | Bertrouf · CC BY-SA 3.0 | [License](https://creativecommons.org/licenses/by-sa/3.0) |
| Saison Dupont | [Source 1](https://www.brasserie-dupont.com/saison-dupont/) | [/images/world-dupont-saison.jpg](https://commons.wikimedia.org/wiki/File:Saison_Dupont.jpg) | Jmcstrav · CC BY-SA 3.0 (also public domain dedication) | [License](https://creativecommons.org/licenses/by-sa/3.0) |
| St. Bernardus Abt 12 | [Source 1](https://www.sintbernardus.be/en/brewery/our-beers/stbernardus-abt-12-en) | [/images/world-bernardus-abt.jpg](https://commons.wikimedia.org/wiki/File:Stbernardusabt.jpg) | Dirk Van Esbroeck · CC BY-SA 3.0 | [License](https://creativecommons.org/licenses/by-sa/3.0) |

### Added location references

| Brewery/brand | Country | City | Precision | Coordinates | Coordinate reference |
|---|---|---|---|---|---|
| Unibroue | Canada | Chambly, Québec | city | 45.45, -73.28333333 | [Reference](https://en.wikipedia.org/wiki/Chambly,_Quebec) |
| Brouwerij de Koningshoeven · La Trappe | Netherlands | Berkel-Enschot | brewery | 51.54355, 5.12661667 | [Reference](https://en.wikipedia.org/wiki/De_Koningshoeven_Brewery) |
| Brouwerij ’t IJ | Netherlands | Amsterdam | brewery | 52.36666667, 4.92638889 | [Reference](https://en.wikipedia.org/wiki/Brouwerij_%27t_IJ) |
| Nøgne Ø | Norway | Grimstad | city | 58.3405, 8.5934 | [Reference](https://en.wikipedia.org/wiki/Grimstad_(town)) |
| Mikkeller | Denmark | Copenhagen | city | 55.67611111, 12.56833333 | [Reference](https://en.wikipedia.org/wiki/Copenhagen) |
| Cervejaria Colorado | Brazil | Ribeirão Preto | city | -21.17833333, -47.80666667 | [Reference](https://en.wikipedia.org/wiki/Ribeir%C3%A3o_Preto) |
| Omnipollo | Sweden | Sundbyberg | city | 59.36666667, 17.96666667 | [Reference](https://en.wikipedia.org/wiki/Sundbyberg_Municipality) |
| Brasserie d’Orval | Belgium | Villers-devant-Orval | brewery | 49.63944444, 5.34861111 | [Reference](https://en.wikipedia.org/wiki/Orval_Brewery) |
| Brasserie d’Achouffe | Belgium | Achouffe | brewery | 50.1509, 5.7456 | [Reference](https://en.wikipedia.org/wiki/Brasserie_d%27Achouffe) |
| Brouwerij Rodenbach | Belgium | Roeselare | brewery | 50.946495, 3.13761 | [Reference](https://en.wikipedia.org/wiki/Rodenbach_Brewery) |
| Brasserie Dupont | Belgium | Tourpes | brewery | 50.571989, 3.650757 | [Reference](https://en.wikipedia.org/wiki/Dupont_Brewery) |
| Brouwerij St. Bernardus | Belgium | Watou | city | 50.86666667, 2.61666667 | [Reference](https://en.wikipedia.org/wiki/Watou) |
