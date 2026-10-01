#!/usr/bin/env python3
"""Build reviewed locality references from saved coordinate responses, offline.

This is an explicit match table, not geocoding by brewery name. BeerTasting's
captured city/country identifies each locality. Ambiguous/different-scope places
have additional reviewed identity evidence and an explicit qualification below.
"""
from pathlib import Path
from urllib.parse import quote
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/data-sources/beertasting'
EXPANSION = ROOT / 'research/beertasting-geographic-expansion-2026-09-18'
PLACES = {
    'fremont-brewing-company': 'Seattle', 'cerveceria-wendlandt': 'Ensenada',
    'cerveceria-kross': 'Curacaví', 'einstok': 'Akureyri', 'flying-dodo': 'Moka',
    'pasteur-street-brewing-company': 'Ho Chi Minh City', 'magpie-brewing': 'Seoul',
    'bira-91': 'New Delhi', 'brewlander': 'Singapore', 'brewerkz': 'Singapore',
    'lervig': 'Stavanger', 'taihu-brewing': 'New Taipei City', 'septem-microbrewery': 'Avlonari',
    'bright-tank-brewing-co': 'Perth', 'bateleur-brewery': 'Nairobi', 'ocean-lab': 'San Juan, Puerto Rico',
    'full-moon-brewwork': 'Kathu district', 'driftwood-brewery': 'Victoria, British Columbia',
    'omnipollo': 'Stockholm', 'cerveceria-blest': 'Bariloche', 'dao-brewing': 'Chengdu',
    'great-leap-brewing': 'Beijing', 'brewhogs': 'Barbeque Downs', '254-brewing': 'Kikuyu, Kenya',
}
EXTRA = {
    'bira-91': ('https://www.linkedin.com/company/bira-91',
        '公开公司主页列总部 New Delhi；列表保存的旧城市字段为 Zamrudpur。此点采用 New Delhi 城市参考，非 Zamrudpur 精确位置，也不代表其多座生产厂。'),
    'brewerkz': ('https://brewerkz.com/outlet/riverside-point/',
        '官网核对 Riverside Point 地址为 30 Merchant Road, Singapore；使用 Singapore 城市参考，非 Riverside Point 建筑坐标。'),
    'flying-dodo': ('https://www.flyingdodo.com/',
        '官网核对主酒厂地址 Reduit 80832, Moka；Réduit 百科重定向 Moka，采用 Moka 聚落参考，不是 Bagatelle 商场厂址。'),
    'septem-microbrewery': ('https://www.septem.gr/s-beers-saturday-en.html',
        '官网核对 Orologio of Avlonari, Kymi-Aliveri；采用 Avlonari 聚落参考，不是 Orologio 精确厂址。'),
    'brewhogs': ('https://www.brewhogs.co.za/contact-us/',
        '官网核对厂址位于 Barbeque Downs, Kyalami；采用 Barbeque Downs 聚落参考，排除同名 Kyalami 赛车赛道坐标。'),
    'full-moon-brewwork': ('https://www.beertasting.com/en/brewery/full-moon-brewwork',
        '来源明确 Kathu / Phuket / Thailand，并列 Patong 地址；采用泰国 Kathu district 座标参考。已排除同名南非 Kathu。'),
    'cerveceria-wendlandt': ('https://www.beertasting.com/en/brewery/cerveceria-wendlandt',
        '目录城市为 Ensenada、国家 MX，与 Ensenada 城市词条匹配。目录 region 写 Estado de México 与该城市所属 Baja California 不符，原字段保留，不使用冲突 region 定位。'),
}


def main():
    breweries = json.loads((EXPANSION / 'breweries.json').read_text())['records']
    pages = {}
    for filename in ['coordinate-response.json', 'coordinate-supplement-response.json']:
        response = json.loads((EXPANSION / filename).read_text())
        for page in response['response']['query']['pages'].values():
            if page.get('coordinates'):
                pages[page['title']] = (page, response['url'])
    # The town's visible infobox has coordinates even though GeoData's primary
    # coordinate field is absent. Values transcribed from that public infobox.
    pages['Kikuyu, Kenya'] = ({'pageid': 7409509,
        'coordinates': [{'lat': -1.250, 'lon': 36.667}],
        'title': 'Kikuyu, Kenya'}, 'https://en.wikipedia.org/w/index.php?title=Kikuyu,_Kenya&oldid=1364460595')
    verified_at = '2026-09-18'
    result = []
    for brewery in breweries:
        slug = brewery['slug']; title = PLACES[slug]; page, query = pages[title]
        coordinate = page['coordinates'][0]
        listing = f'https://www.beertasting.com/en/brewery/{slug}/beers'
        identity, note = EXTRA.get(slug, (listing,
            f"公开列表的酒厂 ID、城市 {brewery['city']} 与国家 {brewery['country']} 已核对；城市/聚落坐标取自 {title}，非精确厂址或逐款生产地。"))
        coordinate_url = 'https://en.wikipedia.org/wiki/' + quote(title.replace(' ', '_'), safe=',')
        result.append({'sourceBreweryId': brewery['id'], 'sourceBrewerySlug': slug,
            'breweryName': brewery['name'], 'city': brewery['city'], 'region': brewery['region'],
            'countryCode': brewery['country'], 'locationPrecision': 'city',
            'locationRole': 'brewery_city_reference', 'productionLocationVerified': False,
            'verifiedAt': verified_at, 'sourceListingUrl': listing,
            'lat': coordinate['lat'], 'lng': coordinate['lon'],
            'coordinateSourceUrl': coordinate_url, 'coordinateQueryUrl': query,
            'coordinateSourcePageId': page['pageid'], 'coordinatePlaceTitle': title,
            'coordinateScope': 'district_seat_reference' if slug == 'full-moon-brewwork' else 'city_or_settlement_reference',
            'identitySourceUrl': identity, 'method': 'reviewed_public_locality_reference',
            'verificationNote': note, 'sourceUrls': list(dict.fromkeys([listing, identity, coordinate_url]))})
    pilot_ids = {r['id'] for r in json.loads((ROOT / 'research/beertasting-pilot-2026-09-18/breweries.json').read_text())['records']}
    old = json.loads((SOURCE / 'brewery-locations.json').read_text())
    originals = [r for r in old['records'] if r['sourceBreweryId'] in pilot_ids]
    assert len(originals) == 14 and len(result) >= 20
    document = {'scope': 'Original 14 reviewed pilot cities plus explicitly matched geographic-expansion localities; no production-location claim.',
        'verifiedAt': verified_at, 'records': [*originals, *result]}
    (EXPANSION / 'brewery-locations.json').write_text(json.dumps({'records': result}, ensure_ascii=False, indent=2) + '\n')
    (SOURCE / 'brewery-locations.json').write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'newReferences': len(result), 'newUniquePoints': len({(r['lat'],r['lng']) for r in result}), 'allReferences': len(document['records'])}))


if __name__ == '__main__':
    main()
