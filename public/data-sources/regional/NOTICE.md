# Regional product data and image sources

Reviewed on 2026-10-02. Public product facts and original product images; copyright remains with the source holders. No open licence or current availability is implied. No ratings, sales ranks or awards are invented. Egypt entries are industrial brands, not independently certified craft beer.

Local preview release 1.21.2 has not been deployed. The combined regional collection, including the separately attributed Central Asian entries, contains 90 products, 23 breweries and 16 countries. This batch adds or completes 22 regional products: Jordan 4, Nepal 4, Nigeria 3, Costa Rica 3, Uruguay 3, Peru 2 and Yukon, Canada 3. These are researched samples, not complete national catalogues or sales rankings.

Coordinates are city/locality reference points, not surveyed production buildings. Source URLs and any packaging/version conflicts remain in each data record. Opaque and multi-product original photos are retained as supplied; the original-file entries below are distinct from the reviewed transparent display derivatives.

Coordinate attribution: © OpenStreetMap contributors, [Open Database Licence (ODbL)](https://www.openstreetmap.org/copyright), for the Portland, Maine city reference ([node 158867610](https://www.openstreetmap.org/node/158867610)) and the Kurintar, Chitwan, Nepal locality reference ([node 279339376](https://www.openstreetmap.org/node/279339376); [original coordinate response](https://api.openstreetmap.org/api/0.6/node/279339376)). Yak Brewing Company identifies Kurintar on its [official brewery page](https://barahsinghe.com/the-brewery/); the OSM hamlet node supplies the locality coordinates, not a surveyed brewery address. Central Asian OSM attribution is recorded in the separate central-asia notice.

Display-only framing: transparent PNGs are decoded including palette tRNS. A measured alpha body with padding excludes distant faint shadows. Opaque product frames are visually reviewed, where available. Full-alpha bounds, display bounds and original SHA-256 values are retained; source image bytes remain unchanged. Manual framing references: `image-display-bounds.json`.

## Reviewed transparent display derivatives

34 images have separately cached alpha-only PNG derivatives. Local Python/Pillow processing uses reviewed product contours or deterministic white-background extraction; original canvas dimensions and decoded RGB byte values are unchanged. No generative fill, redrawing, recolouring or reconstruction is used. Backgrounds, glasses, unrelated cans and decorative objects are made transparent by the alpha mask. Source images are not overwritten.

- Registry: `public/data-sources/regional/image-cutouts.json` (deployed asset path: `data-sources/regional/image-cutouts.json`). It records beer ID, source and derivative paths, both SHA-256 hashes, dimensions, alpha bounds, method/parameters, limitations and visual review status.
- Contour/extraction scripts: `scripts/extract-regional-front-products.py`, `scripts/cutout-saldens-epica.py`, `scripts/cutout-americas-maui-egypt.py`, and `scripts/cutout-japan-bature.py`.
- Integration and size generation: `scripts/apply-regional-image-cutouts.py` verifies matching canvas dimensions and original RGB pixels, then creates lossless WebP card/map display variants by scaling the whole canvas without cropping or enlargement. Full-size alpha PNGs and unchanged original source files remain available.
- Body framing: `scripts/measure-regional-image-bounds.py` and `image-display-bounds.json` describe display bounds; framing metadata does not replace the source image or licence.
- Limitation: the three Maui source cans reach the right canvas edge. A possibly clipped thin edge is retained as supplied, never reconstructed; the cap/rim, bottom and front label remain visible.

The card and map derivatives do not grant additional rights to the underlying product photography or brands. The detailed source panel is hidden in the product UI, but attribution, source URLs and derivation evidence remain in the complete catalog and source files. The small map bootstrap omits bulky audit copies for loading speed; the complete on-demand catalog preserves them, with all records retained.

## Locations

- **Salden's Brewery** — Tula, Russia; 54.2, 37.61666666666667. Identity: https://www.saldens.ru/. Coordinate: https://en.wikipedia.org/wiki/Tula,_Russia.
- **Beerfarm** — Metricup, Australia; -33.766666666666666, 115.13333333333334. Identity: https://www.beerfarm.com.au/pages/the-farm. Coordinate: https://en.wikipedia.org/wiki/Metricup,_Western_Australia.
- **Birra Salento** — Leverano, Italy; 40.28903, 18.00002. Identity: https://birrasalento.it/visite-guidate. Coordinate: https://www.geonames.org/6538971/leverano.html.
- **Al Ahram Beverages Company** — El Obour, Egypt; 30.205, 31.4575. Identity: https://www.alahrambeverages.com/about-us/plants/. Coordinate: https://dbpedia.org/page/Obour_%28city%29.
- **Cervezas Althaia** — Altea, Spain; 38.59861, -0.05194. Identity: https://cervezasalthaia.com/en/search. Coordinate: https://en.wikipedia.org/wiki/Altea.
- **Maui Brewing Co.** — Kihei, United States; 20.75917, -156.45722. Identity: https://mauibrewingco.com/discover-our-beer/. Coordinate: https://en.wikipedia.org/wiki/Kihei,_Hawaii.
- **Deschutes Brewery** — Bend, United States; 44.058055555555555, -121.31527777777778. Identity: https://deschutesbrewery.com/pages/bend-tasting-room-beer-garden. Coordinate: https://en.wikipedia.org/wiki/Bend,_Oregon.
- **Bell’s Brewery** — Comstock Township, United States; 42.29694, -85.49889. Identity: https://bellsbeer.com/beers/hazy-hearted/. Coordinate: https://en.wikipedia.org/wiki/Comstock_Township,_Michigan.
- **Allagash Brewing Company** — Portland, United States; 43.6573605, -70.2586618. Identity: https://www.allagash.com/portland-maine/. Coordinate: https://api.openstreetmap.org/api/0.6/node/158867610.
- **Birra Epica** — Sinagra, Italy; 38.08191, 14.85009. Identity: https://www.birraepica.it/ilbirrificio/. Coordinate: https://www.geonames.org/2523090/sinagra.html.
- **DouGall’s** — Liérganes, Spain; 43.35, -3.76667. Identity: https://dougalls.es/preguntas-frecuentes. Coordinate: https://www.geonames.org/3118443/lierganes.html.
- **Abashiri Beer** — Abashiri, Japan; 44.016666666666666, 144.26666666666668. Identity: https://www.abashiribeer.jp/lineup/. Coordinate: https://en.wikipedia.org/wiki/Abashiri.
- **Baeren Brewery** — Morioka, Japan; 39.702083333333334, 141.1545. Identity: https://baeren.jp/pages/company. Coordinate: https://en.wikipedia.org/wiki/Morioka.
- **Carakale Brewing Company** — Fuheis, Jordan; 32.016666666666666, 35.766666666666666. Identity: https://www.carakale.com/our-brewery. Coordinate: https://en.wikipedia.org/wiki/Fuheis.
- **Yak Brewing Company** — Kurintar, Nepal; 27.8724268, 84.6228073. Identity: https://barahsinghe.com/the-brewery/. Coordinate: https://www.openstreetmap.org/node/279339376.
- **Bature Brewery** — Lagos, Nigeria; 6.456111111111111, 3.393611111111111. Identity: https://www.baturebrewery.com/our-range/lagos-lager/. Coordinate: https://en.wikipedia.org/wiki/Lagos.
- **Cervecería Gracia** — Santa Ana, Costa Rica; 9.9326, -84.18255. Identity: https://www.cerveceriagracia.com/. Coordinate: https://www.geonames.org/3621630/santa-ana.html.
- **Cabesas Bier** — Tacuarembó, Uruguay; -31.71882, -55.97925. Identity: https://cabesas.uy/bier/. Coordinate: https://www.geonames.org/3440034/tacuarembo.html.
- **Sierra Andina** — Huaraz, Peru; -9.52614, -77.52869. Identity: https://mail.sierraandina.com/index.php/quienes-somos. Coordinate: https://www.geonames.org/3696378/huaraz.html.
- **Yukon Brewing** — Whitehorse, Canada; 60.72416667, -135.05611111. Identity: https://yukonbeer.com/brewery/. Coordinate: https://en.wikipedia.org/wiki/Whitehorse.

## Products and unchanged cached image files

### APA Tears of Liberty · Salden's Brewery

- ID: `regional-saldens-tears-of-liberty`
- Product: https://www.saldens.ru/page11383056.html
- Original image: https://static.tildacdn.com/tild3331-3662-4135-b935-373963396638/_MG_1226.jpg
- Local path: `/images/regional/saldens-tears-of-liberty.jpg`
- SHA-256: `07ed8bdc3d768cc8c26f31a83c750ec4fa053c6770ddb5372f336b5d9fb04d1e`
- Note: 款名和介绍来自官网该产品卡片；ABV、IBU来自同卡原始包装照片的可读标签，包装拍摄/配方批次日期未注明。

### AIPA 4C · Salden's Brewery

- ID: `regional-saldens-aipa-4c`
- Product: https://www.saldens.ru/page11383056.html
- Original image: https://static.tildacdn.com/tild6561-6636-4162-b333-396337383861/_MG_1233.jpg
- Local path: `/images/regional/saldens-aipa-4c.jpg`
- SHA-256: `c6b7586e3878107ae938c71a33bacc9e8757c27be64a36cc942421e39a9f07cb`
- Note: 款名和介绍来自官网该产品卡片；ABV、IBU来自同卡原始包装照片的可读标签，包装拍摄/配方批次日期未注明。

### American IPA Six Hops · Salden's Brewery

- ID: `regional-saldens-six-hops`
- Product: https://www.saldens.ru/page11383056.html
- Original image: https://static.tildacdn.com/tild6262-3032-4463-b563-343561616339/_MG_1213.jpg
- Local path: `/images/regional/saldens-six-hops.jpg`
- SHA-256: `ed79ec421502d5c22975b3e0fb2e5a5f6f845ba0f483d9e7a8281efe2c356451`
- Note: 款名和介绍来自官网该产品卡片；ABV、IBU来自同卡原始包装照片的可读标签，包装拍摄/配方批次日期未注明。 网页酒花清单含 Centennial，罐标则含 Summit，hops 留空以免混合不同配方版本。

### DIPA Grapefruit · Salden's Brewery

- ID: `regional-saldens-grapefruit-dipa`
- Product: https://www.saldens.ru/page11383056.html
- Original image: https://static.tildacdn.com/tild3162-3262-4065-b564-396637656231/_MG_1232.jpg
- Local path: `/images/regional/saldens-grapefruit-dipa.jpg`
- SHA-256: `156e350c4be180978b532b44912328bb0cf1bf9c72dc0d8fe6cec59599622d73`
- Note: 款名和介绍来自官网该产品卡片；ABV、IBU来自同卡原始包装照片的可读标签，包装拍摄/配方批次日期未注明。 网页写葡萄柚汁和 Citra/Chinook/Cascade；罐标写 grapefruit peel 和 Cascade/Chinook，配料与酒花结构化字段留空。

### DIPA Citra&Mosaic · Salden's Brewery

- ID: `regional-saldens-citra-mosaic-dipa`
- Product: https://www.saldens.ru/page11383056.html
- Original image: https://static.tildacdn.com/tild3965-3435-4130-a535-643835336666/_MG_1225.jpg
- Local path: `/images/regional/saldens-citra-mosaic-dipa.jpg`
- SHA-256: `e324b64b193aad123f18a82da2a4e29404bf6b7908c06395cbda48eda918bfe7`
- Note: 款名和介绍来自官网该产品卡片；ABV、IBU来自同卡原始包装照片的可读标签，包装拍摄/配方批次日期未注明。

### Beerfarm Pale Ale · Beerfarm

- ID: `regional-beerfarm-pale`
- Product: https://www.beerfarm.com.au/products/pale-24x375ml
- Original image: https://cdn.shopify.com/s/files/1/0071/4571/7858/files/beerfarm-pale-296822.png?v=1738899405
- Local path: `/images/regional/beerfarm-pale.png`
- SHA-256: `d48b5ea11b4eb476ee2cef42d93b7a7b86645945443480882d719312ea7fdb27`
- Note: 官网单款商品页与公开 Shopify 商品 JSON；数值和文字按本次官网公开版本，未知字段未从风格推算。

### Beerfarm Royal Haze · Beerfarm

- ID: `regional-beerfarm-hazy`
- Product: https://www.beerfarm.com.au/products/royal-haze-24x375ml
- Original image: https://cdn.shopify.com/s/files/1/0071/4571/7858/files/beerfarm-royal-haze-819624.png?v=1738898841
- Local path: `/images/regional/beerfarm-hazy.png`
- SHA-256: `c62d544193416aca940b3cc5479bd8bc3f3085623a317e7667023975c2695b82`
- Note: 官网单款商品页与公开 Shopify 商品 JSON；数值和文字按本次官网公开版本，未知字段未从风格推算。

### Beerfarm Milk Stout · Beerfarm

- ID: `regional-beerfarm-stout`
- Product: https://www.beerfarm.com.au/products/milk-stout
- Original image: https://cdn.shopify.com/s/files/1/0071/4571/7858/files/beerfarm-milk-stout-160805.png?v=1738899789
- Local path: `/images/regional/beerfarm-stout.png`
- SHA-256: `9f185203647891171ba0a0276040cecabaab9e2ff86334a128f3dfd3815625ed`
- Note: 官网单款商品页与公开 Shopify 商品 JSON；数值和文字按本次官网公开版本，未知字段未从风格推算。

### Beerfarm India Pale Ale · Beerfarm

- ID: `regional-beerfarm-ipa`
- Product: https://www.beerfarm.com.au/products/ipa-24x375ml
- Original image: https://cdn.shopify.com/s/files/1/0071/4571/7858/files/beerfarm-india-pale-ale-992596.png?v=1738899709
- Local path: `/images/regional/beerfarm-ipa.png`
- SHA-256: `20ea0d2ca1f2cc77ba00d151f6afa1778b766cc3fde2da6fd0aba67492675759`
- Note: 官网单款商品页与公开 Shopify 商品 JSON；数值和文字按本次官网公开版本，未知字段未从风格推算。

### Beerfarm Lager · Beerfarm

- ID: `regional-beerfarm-lager`
- Product: https://www.beerfarm.com.au/products/beerfarm-lager
- Original image: https://cdn.shopify.com/s/files/1/0071/4571/7858/files/beerfarm-lager-138681.png?v=1738899251
- Local path: `/images/regional/beerfarm-lager.png`
- SHA-256: `f4c4245bda684dc3bf3f7f784ebe87ac5875aba3f83ccf5678b8b5675e25697d`
- Note: 官网单款商品页与公开 Shopify 商品 JSON；数值和文字按本次官网公开版本，未知字段未从风格推算。

### Beerfarm Hazy Pale · Beerfarm

- ID: `regional-beerfarm-hazypale`
- Product: https://www.beerfarm.com.au/products/beerfarm-hazy-pale
- Original image: https://cdn.shopify.com/s/files/1/0071/4571/7858/files/beerfarm-hazy-pale-635996.png?v=1738898974
- Local path: `/images/regional/beerfarm-hazypale.png`
- SHA-256: `81885c9571cd86d3819b8497ab074e0d9d447679a5816dd02dd60079ae63b750`
- Note: 官网单款商品页与公开 Shopify 商品 JSON；数值和文字按本次官网公开版本，未知字段未从风格推算。

### Agricola · Birra Salento

- ID: `regional-salento-agricola`
- Product: https://birrasalento.it/linea-tradizione/agricola/
- Original image: https://birrasalento.it/wp-content/uploads/2021/03/AGRICOLA-CHIARA-1.png
- Local path: `/images/regional/salento-agricola.png`
- SHA-256: `7a18e40e4aac5f049339318190090e4896beacbac7318eb27cab68608b730c43`
- Note: 官网产品事实的中文摘要；未编造评分、获奖或未公布参数。地理点为已注明精度的城市参考。

### Fresca · Birra Salento

- ID: `regional-salento-fresca`
- Product: https://birrasalento.it/linea-tradizione/fresca/
- Original image: https://birrasalento.it/wp-content/uploads/2021/03/FRESCA-1.png
- Local path: `/images/regional/salento-fresca.png`
- SHA-256: `9e731aa913648832d263ad15c3a22b0f36f2053eddf0bdc1c7d039d2f563df21`
- Note: 官网产品事实的中文摘要；未编造评分、获奖或未公布参数。地理点为已注明精度的城市参考。

### Sakara Gold · Al Ahram Beverages Company

- ID: `regional-sakara-gold`
- Product: https://www.alahrambeverages.com/brands/sakara/
- Original image: https://www.alahrambeverages.com/media/1180/h1-1.jpg
- Local path: `/images/regional/sakara-gold.jpg`
- SHA-256: `b9d515667797ead3ce64aa567db4dcc82d0f79d27baa3aa825b0ab36dc6fd647`
- Note: 官网产品事实的中文摘要；未编造评分、获奖或未公布参数。地理点为已注明精度的城市参考。 埃及主流工业品牌，非独立精酿；使用原图，不生成包装。 当前官网 ABV 3.86%；旧库有无厂名的同名 4% 历史行，尚未核实版本一致，不自动合并或覆盖。

### Sakara El-King 10% · Al Ahram Beverages Company

- ID: `regional-sakara-el-king-10`
- Product: https://www.alahrambeverages.com/brands/sakara/
- Original image: https://www.alahrambeverages.com/media/1365/king.png
- Local path: `/images/regional/sakara-el-king.png`
- SHA-256: `660e0117eb2448a2022da93daf4d3615ebcb2677f7dcd7555e99862da2b89be7`
- Note: 官网产品事实的中文摘要；未编造评分、获奖或未公布参数。地理点为已注明精度的城市参考。 埃及主流工业品牌，非独立精酿；使用原图，不生成包装。

### Meister Max · Al Ahram Beverages Company

- ID: `regional-meister-max`
- Product: https://www.alahrambeverages.com/brands/meister-max/
- Original image: https://www.alahrambeverages.com/media/1527/meister-01.png
- Local path: `/images/regional/meister-max-bottle.png`
- SHA-256: `edb31f758c58ad8be47cfa4516567ff2de8b9a436dd015de3b127d0018417e18`
- Note: 官网产品事实的中文摘要；未编造评分、获奖或未公布参数。地理点为已注明精度的城市参考。 埃及主流工业品牌，非独立精酿；使用原图，不生成包装。

### Cap Blanc · Cervezas Althaia

- ID: `regional-althaia-cap-blanc`
- Product: https://cervezasalthaia.com/en/products/cap-blanc-apa-lata-33cl?variant=54366107402579
- Original image: https://cervezasalthaia.com/cdn/shop/files/lata_cap_blanc_1.png?v=1786367217
- Local path: `/images/regional/althaia/cap-blanc.png`
- SHA-256: `412bcb9385ae69b9a234b57818df4968ce330937c4061008d4c5335b43705e2f`
- Note: 酒名、风格、ABV、IBU 和风味介绍来自酒厂官网当前商品页；介绍为忠实中文短述。图片为同页官方包装原图。未补造评分、获奖记录或具体酒花品种。

### Mediterranean IPA · Cervezas Althaia

- ID: `regional-althaia-mediterranean-ipa`
- Product: https://cervezasalthaia.com/en/products/mediterranean-ipa-lata-33cl?variant=54365934027091
- Original image: https://cervezasalthaia.com/cdn/shop/products/IPALATA1.png?v=1666707197
- Local path: `/images/regional/althaia/mediterranean-ipa.png`
- SHA-256: `d30d300d186517acfa4a42fc3dd4cae61aafcbc6ea27bc716d52266a3cc29475`
- Note: 酒名、风格、ABV、IBU 和风味介绍来自酒厂官网当前商品页；介绍为忠实中文短述。图片为同页官方包装原图。未补造评分、获奖记录或具体酒花品种。

### Flama · Cervezas Althaia

- ID: `regional-althaia-flama`
- Product: https://cervezasalthaia.com/en/products/flama-smoked-lager-lata-33cl?variant=54366578114899
- Original image: https://cervezasalthaia.com/cdn/shop/files/althaia-flama-lata_1e590f88-a07c-40f8-af38-e1755a8fa3d2.png?v=1784796687
- Local path: `/images/regional/althaia/flama.png`
- SHA-256: `b604503499d500067bcb6449c7155459188994bd6757c8337f03ff052f049827`
- Note: 酒名、风格、ABV、IBU 和风味介绍来自酒厂官网当前商品页；介绍为忠实中文短述。图片为同页官方包装原图。未补造评分、获奖记录或具体酒花品种。

### Heliodora · Cervezas Althaia

- ID: `regional-althaia-heliodora`
- Product: https://cervezasalthaia.com/en/products/heliodora-berliner-weisse-botella-33cl?variant=54366474535251
- Original image: https://cervezasalthaia.com/cdn/shop/files/althaia-heliodora-1.png?v=1784793331
- Local path: `/images/regional/althaia/heliodora.png`
- SHA-256: `a227ab60f1caa601087440634f9e6c84c36d268c8826e0c194d17c7b7959e74b`
- Note: 酒名、风格、ABV、IBU 和风味介绍来自酒厂官网当前商品页；介绍为忠实中文短述。图片为同页官方包装原图。未补造评分、获奖记录或具体酒花品种。 官网标题与正文容量不一致，容量暂不填写。

### Mediterranean Lager · Cervezas Althaia

- ID: `regional-althaia-mediterranean-lager`
- Product: https://cervezasalthaia.com/en/products/mediterranean-lager-lata-33cl?variant=54365593796947
- Original image: https://cervezasalthaia.com/cdn/shop/files/lata_Lager.png?v=1784632278
- Local path: `/images/regional/althaia/mediterranean-lager.png`
- SHA-256: `5efb2eb3eb317a5feb56d359994c92904e9028f415c9f114dc42b6bf3e65fc01`
- Note: 酒名、风格、ABV、IBU 和风味介绍来自酒厂官网当前商品页；介绍为忠实中文短述。图片为同页官方包装原图。未补造评分、获奖记录或具体酒花品种。

### Mistral · Cervezas Althaia

- ID: `regional-althaia-mistral`
- Product: https://cervezasalthaia.com/en/products/mistral-doble-ipa-lata-44cl?variant=54366359159123
- Original image: https://cervezasalthaia.com/cdn/shop/files/althaia-mistral-lata-1.png?v=1784794957
- Local path: `/images/regional/althaia/mistral.png`
- SHA-256: `2e6a4f7833f07f42c709b0eed11b6ae276aaea6681a8c39a483686e13777ec79`
- Note: 酒名、风格、ABV、IBU 和风味介绍来自酒厂官网当前商品页；介绍为忠实中文短述。图片为同页官方包装原图。未补造评分、获奖记录或具体酒花品种。 官网标题与正文容量不一致，容量暂不填写。

### Maui Light · Maui Brewing Co.

- ID: `regional-maui-light`
- Product: https://mauibrewingco.com/discover_beer/maui-light/
- Original image: https://mauibrewingco.com/wp-content/uploads/2026/03/2026-ML-Off-235x316-1.jpg
- Local path: `/images/regional/maui-light.jpg`
- SHA-256: `ee2f442228fb70345c1f69346d16f3226630e6a0708285a6163672b7b5605606`
- Note: 参数与风味介绍来自该款官网产品页；图片为官方原始构图。收录不表示当前有库存，也不自动标记畅销或获奖。

### OMG Hazy IPA · Maui Brewing Co.

- ID: `regional-maui-omg`
- Product: https://mauibrewingco.com/discover_beer/omg-hazy-ipa/
- Original image: https://mauibrewingco.com/wp-content/uploads/2023/12/2026-OMG-Off-235x316-1.jpg
- Local path: `/images/regional/maui-omg.jpg`
- SHA-256: `9072b7e41f75f2097072172ca6ba852708a802a5c9fa6a8d94c840fc96d95591`
- Note: 参数与风味介绍来自该款官网产品页；图片为官方原始构图。收录不表示当前有库存，也不自动标记畅销或获奖。

### Land of Rainbows Sour · Maui Brewing Co.

- ID: `regional-maui-rainbows`
- Product: https://mauibrewingco.com/discover_beer/land-of-rainbows/
- Original image: https://mauibrewingco.com/wp-content/uploads/2022/01/2022-Limited-Release-Beers-Land-of-Rainbows-Off-235x316-1.png
- Local path: `/images/regional/maui-rainbows.png`
- SHA-256: `9d661bb9a86a1df8faa1854ece351442689195eb1a5bf6407d040d2653e88128`
- Note: 参数与风味介绍来自该款官网产品页；图片为官方原始构图。收录不表示当前有库存，也不自动标记畅销或获奖。

### Allagash Lager · Allagash Brewing Company

- ID: `regional-usa-allagash-lager`
- Product: https://www.allagash.com/beer/pilsner/lager/
- Original image: https://www.allagash.com/wp-content/uploads/Allagash_Lager.png
- Local path: `/images/regional/usa-allagash-lager.png`
- SHA-256: `6d9176cfd6e506ee3417cfa58a48e1d3afedfa45388154b34f811fc76411db90`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。 官方页面正文经公开网页阅读工具读取；产品原图通过公开静态链接下载成功。

### Surf House · Allagash Brewing Company

- ID: `regional-usa-allagash-surf`
- Product: https://www.allagash.com/beer/lager/surf-house/
- Original image: https://www.allagash.com/wp-content/uploads/SurfHouse.png
- Local path: `/images/regional/usa-allagash-surf.png`
- SHA-256: `05fdf9377c373dc78197b2be4b22d6c9f0be501b2e179d26750de677424e4fa0`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。 官方页面正文经公开网页阅读工具读取；产品原图通过公开静态链接下载成功。

### North Sky · Allagash Brewing Company

- ID: `regional-usa-allagash-north`
- Product: https://www.allagash.com/beer/stout/north-sky/
- Original image: https://www.allagash.com/wp-content/uploads/NorthSky.png
- Local path: `/images/regional/usa-allagash-north.png`
- SHA-256: `53de70de5516a5ffd54ae563c65dc50804761c3d9d037b145b5ea6b23da8b058`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。 官方页面正文经公开网页阅读工具读取；产品原图通过公开静态链接下载成功。

### Allagash Hazy IPA · Allagash Brewing Company

- ID: `regional-usa-allagash-hazy`
- Product: https://www.allagash.com/beer/ipa/hazy-ipa/
- Original image: https://www.allagash.com/wp-content/uploads/Hazy-IPA-12oz-Can.png
- Local path: `/images/regional/usa-allagash-hazy.png`
- SHA-256: `fe83a68adec42e1b8be051a58074261835311efb926d62c2b82fa73971127f96`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。 官方页面正文经公开网页阅读工具读取；产品原图通过公开静态链接下载成功。

### Hazy Hearted IPA · Bell’s Brewery

- ID: `regional-usa-bells-hazy`
- Product: https://bellsbeer.com/beers/hazy-hearted/
- Original image: https://bellsbeer.com/wp-content/uploads/2026/03/HazyHearted_WebRender_550x736_2026.png
- Local path: `/images/regional/usa-bells-hazy.png`
- SHA-256: `bf7b7180561a8a5484b7975473ccdb8b2d2d3f2d62ac3345507a7a3741e4466a`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。

### Big Hearted IPA · Bell’s Brewery

- ID: `regional-usa-bells-big`
- Product: https://bellsbeer.com/beers/big-hearted/
- Original image: https://bellsbeer.com/wp-content/uploads/2026/03/BigHearted_WebPage_UnitGlassware_287x510_2026_4367739087.png
- Local path: `/images/regional/usa-bells-big.png`
- SHA-256: `b7b8d0654796ae52bc390e4297b65acc3ac323e1a29eea1b681c5f4a8e13d458`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。

### Cold Hearted IPA · Bell’s Brewery

- ID: `regional-usa-bells-cold`
- Product: https://bellsbeer.com/beers/cold-hearted/
- Original image: https://bellsbeer.com/wp-content/uploads/2026/02/ColdHearted_WebRender.png
- Local path: `/images/regional/usa-bells-cold.png`
- SHA-256: `aa63687dba6fbcb2858f50ef7077e550bde29151e17dcfbbef66a1a57d904605`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。

### Oberon Eclipse · Bell’s Brewery

- ID: `regional-usa-bells-eclipse`
- Product: https://bellsbeer.com/beers/eclipse/
- Original image: https://bellsbeer.com/wp-content/uploads/2023/09/OBEC_WebRender_1440x2626.png
- Local path: `/images/regional/usa-bells-eclipse.png`
- SHA-256: `cd06a33cca58f5630206700beed657a5ce5925aa35c02635427e02405c5f1e20`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。

### Fresh Squeezed IPA · Deschutes Brewery

- ID: `local-kkcp-59622`
- Product: https://deschutesbrewery.com/products/fresh-squeezed-ipa
- Original image: https://cdn.shopify.com/s/files/1/0781/2612/1270/files/Des_FreshSqueezed_2025_Can_12oz_Branded_Naked_OG.png?v=1754069255
- Local path: `/images/regional/usa-deschutes-fresh.png`
- SHA-256: `114e7236d6af03814d415deaf0ed4d598d70553f019d7c5c0633c4520ce6366e`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。 与旧 Untappd 同名款 59622 身份已核对；旧快照 IBU=60，当前官网 IBU=50，保留当前值并记录历史差异。 已核验旧ID：local-kkcp-59622；该补充用于旧款资料丰富，不应重复计作全新酒款。

### Fresh Haze IPA · Deschutes Brewery

- ID: `local-kkcp-2772910`
- Product: https://deschutesbrewery.com/products/fresh-haze-ipa
- Original image: https://cdn.shopify.com/s/files/1/0781/2612/1270/files/Des_FreshHaze_2025_Can_12oz_Branded_Naked_OG.png?v=1754069230
- Local path: `/images/regional/usa-deschutes-haze.png`
- SHA-256: `3db8989aea6d4e4ec355899e3fc35d128c8ef72c9e5a0e126a339632e248588e`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。 已核验旧ID：local-kkcp-2772910；该补充用于旧款资料丰富，不应重复计作全新酒款。

### Patagonia Provisions Organic Lager · Deschutes Brewery

- ID: `regional-usa-deschutes-kernza`
- Product: https://deschutesbrewery.com/products/patagonia-provisions-x-deschutes-brewery-kernza®-lager
- Original image: https://cdn.shopify.com/s/files/1/0781/2612/1270/files/PatagoniaProv_Can_12oz_Organic_Lager_3_1.png?v=1750790011
- Local path: `/images/regional/usa-deschutes-kernza.png`
- SHA-256: `51249eb4e770cd31d3b24ca1b540e33f747345accef6f04fd6f6a1e978c795b8`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。

### Patagonia Provisions Organic IPA · Deschutes Brewery

- ID: `regional-usa-deschutes-organic`
- Product: https://deschutesbrewery.com/products/patagonia-provisions-organic-ipa
- Original image: https://cdn.shopify.com/s/files/1/0781/2612/1270/files/PatagoniaProv_Can_12oz_Organic-IPA.png?v=1788218207
- Local path: `/images/regional/usa-deschutes-organic.png`
- SHA-256: `364a31c235c8b46ea11c536ca78a478edf92bd45aca48eff326e040970215e05`
- Note: 本次官方产品资料与原始包装图；不补写评分、获奖或独立精酿资格。

### Eolo · Birra Epica

- ID: `regional-epica-eolo`
- Product: https://www.birraepica.it/eolo/
- Original image: https://www.birraepica.it/wp-content/uploads/yootheme/cache/a9/a93c1da3.jpg
- Local path: `/images/regional/epica-eolo.jpg`
- SHA-256: `5f175191de29d83776e91120b08b705b29ac178e5a4e917c55a03c4f7218883c`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。

### Cerere · Birra Epica

- ID: `regional-epica-cerere`
- Product: https://www.birraepica.it/cerere-2/
- Original image: https://www.birraepica.it/wp-content/uploads/yootheme/cache/2f/2f976416.jpg
- Local path: `/images/regional/epica-cerere.jpg`
- SHA-256: `333e27c5fbd6c06945ce8e055ff55cc66278f5890f2bc9b28dde645f66fa5779`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。

### Polifemo · Birra Epica

- ID: `regional-epica-polifemo`
- Product: https://www.birraepica.it/polifemo/
- Original image: https://www.birraepica.it/wp-content/uploads/yootheme/cache/67/6720e6a9.jpg
- Local path: `/images/regional/epica-polifemo.jpg`
- SHA-256: `261b27089747c0565e53e1351417fbe98fa5a89ffc39c7e97e2e6a8ceae1e01d`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。

### Ares · Birra Epica

- ID: `regional-epica-ares`
- Product: https://www.birraepica.it/ares/
- Original image: https://www.birraepica.it/wp-content/uploads/yootheme/cache/35/3535d813.jpg
- Local path: `/images/regional/epica-ares.jpg`
- SHA-256: `a4bc8f3b350291450e6ee4fe060ba1ad11a1e1547ee461148ac4a3815fff406d`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。

### Apollo · Birra Epica

- ID: `regional-epica-apollo`
- Product: https://www.birraepica.it/apollo/
- Original image: https://www.birraepica.it/wp-content/uploads/yootheme/cache/d2/d2487d85.jpg
- Local path: `/images/regional/epica-apollo.jpg`
- SHA-256: `4bb5921976996286620f8c0c0544749344f25145212ff70918881d4b77f7bbae`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。

### Leyenda · DouGall’s

- ID: `regional-dougalls-leyenda`
- Product: https://dougalls.es/cerveza-artesana/leyenda
- Original image: https://dougalls.es/ext/r/oxo-2912/cerveza-dougalls-botella-leyenda-N.png
- Local path: `/images/regional/dougalls-leyenda.png`
- SHA-256: `444cc6a1600547150bcbde83ffd63e2d4a94b17a7aa859cb3b860981601fee06`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。

### Hoppy Pils · DouGall’s

- ID: `regional-dougalls-hoppy-pils`
- Product: https://dougalls.es/cerveza-artesana/3145-hoppy-pils
- Original image: https://dougalls.es/ext/r/oxo-3146/cerveza-dougalls-botella-hoppy-pils.png
- Local path: `/images/regional/dougalls-hoppy-pils.png`
- SHA-256: `dfd914f30bbf3594158d36eb4a7c7ca495cf4d0264085acce099d4ec14778fcd`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。 官网列为 2026 年限量产品；不代表当地实时库存。

### Tres Mares · DouGall’s

- ID: `regional-dougalls-tres-mares`
- Product: https://dougalls.es/cerveza-artesana/tres-mares
- Original image: https://dougalls.es/ext/r/oxo-2911/cerveza-dougalls-botella-tres-mares-N.png
- Local path: `/images/regional/dougalls-tres-mares.png`
- SHA-256: `ec32d2021c082c2995c5b2fd07b4f8be314783da1d6381ab4e3194e4b331ea77`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。

### IPA9 · DouGall’s

- ID: `regional-dougalls-ipa9`
- Product: https://dougalls.es/cerveza-artesana/ipa9
- Original image: https://dougalls.es/ext/r/oxo-2910/cerveza-dougalls-botella-ipa9-N.png
- Local path: `/images/regional/dougalls-ipa9.png`
- SHA-256: `25036166a3b31264cad88531b7395a0b210723a010d3f9447ec8f79996065c3d`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。

### IPA4 · DouGall’s

- ID: `regional-dougalls-ipa4`
- Product: https://dougalls.es/cerveza-artesana/ipa4
- Original image: https://dougalls.es/ext/r/oxo-2665/cerveza-dougalls-botella-ipa4-N.png
- Local path: `/images/regional/dougalls-ipa4.png`
- SHA-256: `d763c16fa38baee6c1ed8cda06da2cd0f29079f8e5ff2d632f2844edd50b3359`
- Note: 官网产品及技术参数的中文摘要；未编造评分或授予获奖标签。地图位置为已注明精度的城市参考。 采集时官网瓶装页面显示售罄，本条为产品目录记录。

### ABASHIRI Premium Beer · Abashiri Beer

- ID: `regional-japan-abashiri-premium`
- Product: https://www.abashiribeer.jp/lineup/
- Original image: https://www.abashiribeer.jp/lineup/images/item_04.jpg
- Local path: `/images/regional/japan-abashiri-premium.jpg`
- SHA-256: `1b133bcf6b9d9d129f1e6f638803ec7b95fc9e5664f0fa52efaff2a544573443`
- Note: 本次公开官方产品资料和原始包装照片；不补写评分、奖项或独立精酿资格。IBU 未查得，保留空值。

### 監極の黒 · Abashiri Beer

- ID: `regional-japan-abashiri-stout`
- Product: https://www.abashiribeer.jp/lineup/
- Original image: https://www.abashiribeer.jp/lineup/images/item_05.jpg
- Local path: `/images/regional/japan-abashiri-stout.jpg`
- SHA-256: `aa7ac2b3edf4fb7adcbd9fdbae6bedfb8888145e81b1582927bf7919747c3fb8`
- Note: 本次公开官方产品资料和原始包装照片；不补写评分、奖项或独立精酿资格。IBU 未查得，保留空值。

### ABASHIRI Golden Ale · Abashiri Beer

- ID: `regional-japan-abashiri-golden`
- Product: https://www.abashiribeer.jp/lineup/
- Original image: https://www.abashiribeer.jp/lineup/images/item_07.jpg
- Local path: `/images/regional/japan-abashiri-golden.jpg`
- SHA-256: `88487a80361a8789db757dac48606c4f273721ca6bd33c8091a1033184b9b67f`
- Note: 本次公开官方产品资料和原始包装照片；不补写评分、奖项或独立精酿资格。IBU 未查得，保留空值。

### ABASHIRI ARTISAN ALE · Abashiri Beer

- ID: `regional-japan-abashiri-artisan`
- Product: https://www.abashiribeer.jp/lineup/
- Original image: https://www.abashiribeer.jp/lineup/images/item_08.jpg
- Local path: `/images/regional/japan-abashiri-artisan.jpg`
- SHA-256: `c39a1ba2c43d430c680c36f13004cc824308d063fbd86f84a20f45aae304e84c`
- Note: 本次公开官方产品资料和原始包装照片；不补写评分、奖项或独立精酿资格。IBU 未查得，保留空值。

### Classic · Baeren Brewery

- ID: `regional-japan-baeren-classic`
- Product: https://baeren.jp/products/classic
- Original image: https://cdn.shopify.com/s/files/1/0681/8168/8472/files/10-classic.jpg?v=1752802261
- Local path: `/images/regional/japan-baeren-classic.jpg`
- SHA-256: `f8ac48ff151a6e3cf9b673fcbfa582dd80c48a056f1c968de9604769f49e9071`
- Note: 本次公开官方产品资料和原始包装照片；不补写评分、奖项或独立精酿资格。IBU 未查得，保留空值。

### Schwarz · Baeren Brewery

- ID: `regional-japan-baeren-schwarz`
- Product: https://baeren.jp/products/schwarz
- Original image: https://cdn.shopify.com/s/files/1/0681/8168/8472/files/20-schwarz.jpg?v=1752802338
- Local path: `/images/regional/japan-baeren-schwarz.jpg`
- SHA-256: `d4b3e6b0fa366e3eaed08fc85892eaf459ee647819ee6a065fab0f362ba56c09`
- Note: 本次公开官方产品资料和原始包装照片；不补写评分、奖项或独立精酿资格。IBU 未查得，保留空值。

### Alt · Baeren Brewery

- ID: `regional-japan-baeren-alt`
- Product: https://baeren.jp/products/alt
- Original image: https://cdn.shopify.com/s/files/1/0681/8168/8472/files/30-alt.jpg?v=1774930951
- Local path: `/images/regional/japan-baeren-alt.jpg`
- SHA-256: `2c000c565de61b551cea180b70f8c2e3b4a5835fe763e98c65f844f3cec4de18`
- Note: 本次公开官方产品资料和原始包装照片；不补写评分、奖项或独立精酿资格。IBU 未查得，保留空值。

### Carakale Lager · Carakale Brewing Company

- ID: `regional-gap-carakale-lager`
- Product: https://www.carakale.com/beer
- Original image: https://images.squarespace-cdn.com/content/v1/646fb9dd5f87276022087412/69117070-c49d-4aa0-9b68-6661f9fdda37/Lager.png
- Local path: `/images/regional/gap-carakale-lager.png`
- SHA-256: `5893ee05940013328189f912c3d329c0b4f92021a2770769b926d279a1843a38`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Blue Valley · Carakale Brewing Company

- ID: `regional-gap-carakale-blue-valley`
- Product: https://www.carakale.com/beer
- Original image: https://images.squarespace-cdn.com/content/v1/646fb9dd5f87276022087412/1af18233-4e35-449f-a655-532df335d82a/Blue+Valley.png
- Local path: `/images/regional/gap-carakale-blue-valley.png`
- SHA-256: `9d46fbb7b8c7a9b5a4c2b663b7eb2fd587c4a91fe02790dff40572da7d4085dd`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Blonde Ale · Carakale Brewing Company

- ID: `regional-gap-carakale-blonde`
- Product: https://www.carakale.com/beer
- Original image: https://images.squarespace-cdn.com/content/v1/646fb9dd5f87276022087412/f4b171f2-e686-4fc1-812d-bd10960b5ac9/Blonde.png
- Local path: `/images/regional/gap-carakale-blonde.png`
- SHA-256: `b7cf786ba0e31cd820bbb48802b9920c37aa9382d5cc13a4090a1b405576614a`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Pale Ale · Carakale Brewing Company

- ID: `regional-gap-carakale-pale`
- Product: https://www.carakale.com/beer
- Original image: https://images.squarespace-cdn.com/content/v1/646fb9dd5f87276022087412/7cfe6917-503a-4506-bc42-4fc5e9d81fbb/Pale+Ale.png
- Local path: `/images/regional/gap-carakale-pale.png`
- SHA-256: `a64306a8b7b16d26b35b01be42e659788e2a61a4ec91e59b1bbde49b2823fd66`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Barahsinghe Pilsner Bier · Yak Brewing Company

- ID: `regional-gap-barahsinghe-pilsner-bier`
- Product: https://barahsinghe.com/beers/pilsner-bier/
- Original image: https://barahsinghe.com/wp-content/uploads/2023/06/barahsinghe_pilsner_bier.png
- Local path: `/images/regional/gap-barahsinghe-pilsner-bier.png`
- SHA-256: `a6a932cb4c6ef1c26ce8a85d5d041a4b945894a61fd1c567acda5963388e176f`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Barahsinghe Dunkelweizen · Yak Brewing Company

- ID: `regional-gap-barahsinghe-dunkelweizen`
- Product: https://barahsinghe.com/beers/dunkelweizen/
- Original image: https://barahsinghe.com/wp-content/uploads/2023/06/barahsinghe_dunkelweizen.png
- Local path: `/images/regional/gap-barahsinghe-dunkelweizen.png`
- SHA-256: `13f953f7483126955e70d68310f5fd554237db1a45d2a912c78f185e4a2a4391`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Barahsinghe Hazy IPA · Yak Brewing Company

- ID: `regional-gap-barahsinghe-hazy-ipa`
- Product: https://barahsinghe.com/beers/hazy-ipa/
- Original image: https://barahsinghe.com/wp-content/uploads/2023/06/barahsinghe_hazy_ipa.png
- Local path: `/images/regional/gap-barahsinghe-hazy-ipa.png`
- SHA-256: `848676151449543f70cde6e019219e5f2220a7ff96da408af52eb14336606619`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Barahsinghe Pale Ale · Yak Brewing Company

- ID: `regional-gap-barahsinghe-pale-ale`
- Product: https://barahsinghe.com/beers/pale-ale/
- Original image: https://barahsinghe.com/wp-content/uploads/2023/06/barahsinghe_pale_ale.png
- Local path: `/images/regional/gap-barahsinghe-pale-ale.png`
- SHA-256: `911c2cf149ef0f22ad1f53d85f80ff1a74ce8c9d232491e1e7ad290d487dd0f3`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Black Gold Stout · Bature Brewery

- ID: `regional-gap-bature-black`
- Product: https://www.baturebrewery.com/our-range/black-gold-stout/
- Original image: https://eurn-cdn-endpoint-11-12-hretbkbpg9eja2f5.z02.azurefd.net/0613a9c8989/media/2owbzbcx/canhalo_bg.png
- Local path: `/images/regional/gap-bature-black.png`
- SHA-256: `3388607b4b98993f01b52dc926118f5c6a7fddc885aab99b21f72f427c40fdf6`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Lagos Lager · Bature Brewery

- ID: `regional-gap-bature-lager`
- Product: https://www.baturebrewery.com/our-range/lagos-lager/
- Original image: https://eurn-cdn-endpoint-11-12-hretbkbpg9eja2f5.z02.azurefd.net/0613a9c8989/media/luhj3ozv/canhalo_ll.png
- Local path: `/images/regional/gap-bature-lager.png`
- SHA-256: `45ad8fd10a6b5be3e5da4eec55700f47aaf711f65a00f3c0022ebf45d4839aae`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Harmattan Haze · Bature Brewery

- ID: `regional-gap-bature-haze`
- Product: https://www.baturebrewery.com/our-range/harmattan-haze/
- Original image: https://eurn-cdn-endpoint-11-12-hretbkbpg9eja2f5.z02.azurefd.net/0613a9c8989/media/fugc5c4q/canhalo_hh.png
- Local path: `/images/regional/gap-bature-haze.png`
- SHA-256: `1a44f1809f91f956be01bc919f5c40fee855fdf48bb657b769fa326aad10e152`
- Note: 本次官方产品说明及原图核验；未知评分与独立精酿认证均不补写。

### Alba Summer Ale · Cervecería Gracia

- ID: `regional-gracia-alba`
- Product: https://www.cerveceriagracia.com/alba-summer-ale
- Original image: https://static.wixstatic.com/media/9d4af7_6546ab3344f74e9986ac51f5af295e2a~mv2_d_3543_3543_s_4_2.png
- Local path: `/images/regional/gracia-alba.png`
- SHA-256: `2f9bde3476a5097548e14b328991dada02470ffb8655629d300aafa4145dd8d7`
- Note: 官方产品事实摘要；未编造评分或授予奖项标签。位置为城市参考。

### Ara Tropical IPA · Cervecería Gracia

- ID: `regional-gracia-ara`
- Product: https://www.cerveceriagracia.com/ara-tropical-ipa
- Original image: https://static.wixstatic.com/media/9d4af7_85be5a190a4646b688b21fb6988bf2a9~mv2_d_3543_3543_s_4_2.png
- Local path: `/images/regional/gracia-ara.png`
- SHA-256: `4f45b4da45496663ea1f566e872e906c3961ac9220d81cf8c91db0aee8dabe42`
- Note: 官方产品事实摘要；未编造评分或授予奖项标签。位置为城市参考。

### Mística Porter · Cervecería Gracia

- ID: `regional-gracia-mistica`
- Product: https://www.cerveceriagracia.com/mistica-porter
- Original image: https://static.wixstatic.com/media/9d4af7_6628aa5d3e2c451f93849b9015880d5c~mv2_d_3543_3543_s_4_2.png
- Local path: `/images/regional/gracia-mistica.png`
- SHA-256: `8538dba8af2982e0db03675394304ab7bdc2bdad6033ec21afdeff8e80934bdc`
- Note: 官方产品事实摘要；未编造评分或授予奖项标签。位置为城市参考。

### Scottish Ale · Cabesas Bier

- ID: `regional-cabesas-scottish`
- Product: https://cabesas.uy/producto/scottish-500-ml/
- Original image: https://cabesas.uy/wp-content/uploads/2025/09/CabesasBIER_Scottish_500ml_01.jpg
- Local path: `/images/regional/cabesas-scottish.jpg`
- SHA-256: `b6210ec09f80efdf8b24dd1fb68e3999c03bf7f1ce3392249b80c6fe3860bb27`
- Note: 官方产品事实摘要；未编造评分或授予奖项标签。位置为城市参考。 原图有背景，主体框已目视核验；已另存逐张复核的透明展示衍生图；本表路径与 SHA 保留来源原文件，处理详情见 image-cutouts.json。

### IPA Atómica · Cabesas Bier

- ID: `regional-cabesas-atomica`
- Product: https://cabesas.uy/producto/ipa-atomica/
- Original image: https://cabesas.uy/wp-content/uploads/2025/06/CabesasBIER_ipaatomica_01.jpg
- Local path: `/images/regional/cabesas-atomica.jpg`
- SHA-256: `5e755500cc51d25819a4dcadfa46bc228b434ef78ec622dec999a0e396285b32`
- Note: 官方产品事实摘要；未编造评分或授予奖项标签。位置为城市参考。 原图有背景，主体框已目视核验；已另存逐张复核的透明展示衍生图；本表路径与 SHA 保留来源原文件，处理详情见 image-cutouts.json。

### Sabotaje · Cabesas Bier

- ID: `regional-cabesas-sabotaje`
- Product: https://cabesas.uy/producto/sabotaje-500-ml/
- Original image: https://cabesas.uy/wp-content/uploads/2025/09/CabesasBIER_Sabotaje_01-scaled.jpg
- Local path: `/images/regional/cabesas-sabotaje.jpg`
- SHA-256: `3d9b5fdd25149259f4bc8c4539f164cf3cdfad12268b717f75d8614b73b611f0`
- Note: 官方产品事实摘要；未编造评分或授予奖项标签。位置为城市参考。 原图有背景，主体框已目视核验；已另存逐张复核的透明展示衍生图；本表路径与 SHA 保留来源原文件，处理详情见 image-cutouts.json。

### Inti Golden Ale · Sierra Andina

- ID: `regional-sierra-andina-inti`
- Product: https://www.sierraandina.com/pedir/sbuocEc5hT3GcfjEa/inti-golden-ale
- Original image: https://tofuu.getjusto.com/orioneat-local/resized2/GbJ3QFwxQxocxdbEx-1200-x.webp
- Local path: `/images/regional/sierra-andina-inti.webp`
- SHA-256: `9ab8a2673041d670e84ec645025190f64ba0b29e756a3f0d72e60ca352e9de5c`
- Note: 官方产品事实摘要；未编造评分或授予奖项标签。位置为城市参考。 原图有背景，主体框已目视核验；已另存逐张复核的透明展示衍生图；本表路径与 SHA 保留来源原文件，处理详情见 image-cutouts.json。 IBU未填：官网正文及图下参数块为32，原图瓶身旧标可见25，版本对应未确认。

### Huaracina Pale Ale · Sierra Andina

- ID: `regional-sierra-andina-huaracina`
- Product: https://www.sierraandina.com/pedir/tGgtMScK3YYGv6zYC/huaracina-pale-ale
- Original image: https://tofuu.getjusto.com/orioneat-local/resized2/Zjk7GStnmfskubFXw-1200-x.webp
- Local path: `/images/regional/sierra-andina-huaracina.webp`
- SHA-256: `51f92bdd99b3a0a58cbaff266ff876e9c106c741ee6b05576976bf3a6e357ef6`
- Note: 官方产品事实摘要；未编造评分或授予奖项标签。位置为城市参考。 原图有背景，主体框已目视核验；已另存逐张复核的透明展示衍生图；本表路径与 SHA 保留来源原文件，处理详情见 image-cutouts.json。

### Conspiracy IPA · Yukon Brewing

- ID: `regional-yukon-conspiracy-ipa`
- Product: https://yukonbeer.com/beer/conspiracy-ipa/
- Original image: https://yukonbeer.com/wp-content/uploads/2022/04/Conspiracy-IPA-Tall-Can-Transparent.png
- Local path: `/images/regional/yukon-conspiracy-ipa.png`
- SHA-256: `6067920aff159eefccd637e91daf9c80a7ac68e9eb516f2e8937ecd1d5bb5f6c`
- Note: 官网产品参数与品鉴说明的中文摘要；公开包装原图已缓存，不表示开放版权或实时库存。地图采用白马市城市参考。 官网说明此款由 American NW IPA 更名；旧库 ABV 6.6% 与当前官网 6.7% 不同，作为不同来源版本保留，不按名称强行覆盖。

### Danger Pay Double IPA · Yukon Brewing

- ID: `regional-yukon-danger-pay-double-ipa`
- Product: https://yukonbeer.com/beer/danger-pay-double-ipa/
- Original image: https://yukonbeer.com/wp-content/uploads/2024/04/Danger-Pay-IPA-Tall-Can-Transparent.png
- Local path: `/images/regional/yukon-danger-pay-double-ipa.png`
- SHA-256: `940f41069ecea102ca9d439f4f9b1eaff00ad9904a439807fe9a48e4f780bc0c`
- Note: 官网产品参数与品鉴说明的中文摘要；公开包装原图已缓存，不表示开放版权或实时库存。地图采用白马市城市参考。

### Grizzly Wheat Ale · Yukon Brewing

- ID: `beertasting-a47f7faa-5b5d-4970-bc4c-ee618ec0aa91`
- Product: https://yukonbeer.com/beer/grizzly-wheat-ale/
- Original image: https://yukonbeer.com/wp-content/uploads/2022/04/Grizzly-Wheat-Ale-Tall-Can-Transparent.png
- Local path: `/images/regional/yukon-grizzly-wheat-ale.png`
- SHA-256: `9dcbdccb92a9ba1795485b1d19fc4f3ec8ba17426ce0222ef028ba9ebf85dce9`
- Note: 官网产品参数与品鉴说明的中文摘要；公开包装原图已缓存，不表示开放版权或实时库存。地图采用白马市城市参考。
