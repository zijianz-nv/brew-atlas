#!/usr/bin/env python3
"""Build the demo from the preserved IDS pilot plus reviewed public-HTML batches.

Offline and deterministic: no network requests, image downloads, geocoding,
registration, fuzzy matching, or flavor/ingredient inference during import.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import re
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public/data-sources/beertasting'
PILOT = ROOT / 'research/beertasting-pilot-2026-09-18'
EXPANSION = ROOT / 'research/beertasting-geographic-expansion-2026-09-18'
REGIONS = ROOT / 'research/beertasting-regions-2026-09-18'
DENSITY = ROOT / 'research/beertasting-density-2026-09-18'
QUALITY = ROOT / 'research/beertasting-quality-2026-09-18'
DESCRIPTIONS = ROOT / 'research/beertasting-descriptions-2026-09-18/descriptions-reviewed.json'
CACHE_MANIFEST = SOURCE / 'image-cache.json'
COUNTRY_ZH = {'AT': '奥地利', 'DK': '丹麦', 'BE': '比利时', 'EE': '爱沙尼亚',
              'ES': '西班牙', 'US': '美国', 'CO': '哥伦比亚', 'CA': '加拿大',
              'BR': '巴西', 'JP': '日本', 'HK': '中国香港', 'ZA': '南非',
              'NZ': '新西兰', 'AU': '澳大利亚', 'MX': '墨西哥', 'CL': '智利', 'IS': '冰岛',
              'MU': '毛里求斯', 'VN': '越南', 'KR': '韩国', 'IN': '印度', 'SG': '新加坡',
              'TW': '中国台湾', 'NO': '挪威', 'GR': '希腊', 'KE': '肯尼亚', 'PR': '波多黎各',
              'TH': '泰国', 'SE': '瑞典', 'AR': '阿根廷', 'CN': '中国', 'GE': '格鲁吉亚',
              'GH': '加纳', 'NG': '尼日利亚', 'TZ': '坦桑尼亚', 'UG': '乌干达', 'RW': '卢旺达',
              'ET': '埃塞俄比亚', 'NA': '纳米比亚', 'ZW': '津巴布韦', 'ZM': '赞比亚',
              'MA': '摩洛哥', 'TN': '突尼斯', 'EG': '埃及', 'MZ': '莫桑比克', 'BW': '博茨瓦纳',
              'MG': '马达加斯加', 'SC': '塞舌尔', 'SN': '塞内加尔', 'RE': '留尼汪',
              'GB': '英国', 'IE': '爱尔兰', 'FR': '法国', 'IT': '意大利', 'CZ': '捷克',
              'PL': '波兰', 'FI': '芬兰', 'TR': '土耳其', 'LV': '拉脱维亚', 'RO': '罗马尼亚',
              'ID': '印度尼西亚', 'NP': '尼泊尔', 'RU': '俄罗斯', 'DE': '德国', 'UA': '乌克兰',
              'HU': '匈牙利', 'SK': '斯洛伐克', 'PH': '菲律宾', 'PE': '秘鲁', 'EC': '厄瓜多尔'}
SOURCE_NOTE = ('BeerTasting 公开酒厂列表试采；酒款链接由真实 Instant Data Scraper 导出，'
               'ID、参数及原图元数据由公开页面补充。未提供的风味、酒花和工艺留空；'
               '来源 IBU=0 含义不确定，显示为未知。地图仅为酒厂所在城市参考；'
               '成功缓存的候选图片使用本地文件；缓存不等于逐张身份核验，也未取得再利用授权。')
EXPANSION_NOTE = ('BeerTasting 普通公开酒厂列表 HTML 地理扩采；未使用 Instant Data Scraper。'
                  'ID、酒厂关系、评分与评分人数、参数和候选图均来自该页面结构化数据。'
                  '未提供的风味、酒花和工艺留空；IBU=0 显示未知；地图仅为城市级参考。'
                  '图片本地缓存不等于身份或再利用授权已经核实。')


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def number(value, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return value if value > 0 or (value == 0 and not positive) else None


def candidate_image(row):
    value = row.get('image_url')
    if row.get('image_class') != 'candidate' or not isinstance(value, str):
        return None
    parsed = urlparse(value)
    if parsed.scheme != 'https' or parsed.username or parsed.password or not parsed.hostname:
        return None
    if any(part in parsed.path.lower() for part in ['placeholder', 'draught_beer']):
        return None
    return value


def public_record(row):
    # Personal workstation paths are not useful provenance in a portable demo.
    clean = {key: value for key, value in row.items() if key != 'ids_csv_path'}
    if row.get('ids_csv_path'):
        clean['ids_csv_file'] = Path(row['ids_csv_path']).name
    supplement = clean.get('metadata_supplement_source')
    if isinstance(supplement, str) and supplement.startswith(str(ROOT) + '/'):
        clean['metadata_supplement_source'] = Path(supplement).relative_to(ROOT).as_posix()
    return clean


def cached_image(row, cache):
    """Use a complete, matching local cache only; never silently hotlink."""
    candidate = candidate_image(row)
    if candidate is None:
        return None, 'source_placeholder' if row['image_class'] == 'placeholder' else 'source_missing'
    record = cache.get(candidate)
    if not record:
        return None, 'not_cached'
    if record.get('status') != 'cached':
        return None, 'failed'
    if row['id'] not in record.get('sourceBeerIds', [record.get('sourceBeerId')]):
        return None, 'cache_invalid'
    image_root = (ROOT / 'public/images/beertasting').resolve()
    for variant in ['original', 'map', 'card']:
        entry = record.get(variant) or {}
        web_path = entry.get('path')
        if not isinstance(web_path, str) or not web_path.startswith('/images/beertasting/'):
            return None, 'cache_invalid'
        path = (ROOT / 'public' / web_path.lstrip('/')).resolve()
        if not path.is_relative_to(image_root) or not path.is_file():
            return None, 'cache_invalid'
        blob = path.read_bytes()
        if len(blob) != entry.get('bytes') or hashlib.sha256(blob).hexdigest() != entry.get('sha256'):
            return None, 'cache_invalid'
    return record, 'cached'


def readable_description(value):
    class Text(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.parts = []
        def handle_data(self, data):
            self.parts.append(data)
        def handle_starttag(self, tag, attrs):
            if tag in ['p', 'br', 'div', 'li']: self.parts.append(' ')
        def handle_endtag(self, tag):
            if tag in ['p', 'div', 'li']: self.parts.append(' ')
    parser = Text()
    parser.feed(value)
    return re.sub(r'\s+', ' ', unescape(''.join(parser.parts))).strip()


def build(pilot, source_breweries, references, image_cache=None, descriptions=None):
    records = pilot['records']
    assert len(records) >= 1000 and len({r['id'] for r in records}) == len(records)
    refs = {r['sourceBreweryId']: r for r in references['records']}
    raw_breweries = {r['id']: r for r in source_breweries['records']}
    used = {r['brewery_id'] for r in records}
    assert used == set(refs) == set(raw_breweries)
    breweries = []
    for source in source_breweries['records']:
        ref = refs[source['id']]
        assert source['country'] == ref['countryCode'] and source['city'] == ref['city']
        assert ref['locationPrecision'] == 'city' and ref['productionLocationVerified'] is False
        assert -90 <= ref['lat'] <= 90 and -180 <= ref['lng'] <= 180
        homepage = source.get('homepage_link')
        if homepage and not homepage.startswith(('https://', 'http://')):
            homepage = 'https://' + homepage
        display_city = (ref.get('verifiedCity') or ref.get('reviewedCity') or source['city'].strip()
                        or ref.get('resolvedLocality') or ref.get('coordinatePlaceTitle') or source['city'])
        brewery = {
            'id': 'beertasting-brewery-' + source['id'], 'name': source['name'],
            'nameZh': source['name'], 'country': source['country_name'],
            'countryZh': COUNTRY_ZH.get(source['country'], source['country_name']), 'countryCode': source['country'],
            'city': display_city, 'region': source['region'],
            'lat': ref['lat'], 'lng': ref['lng'], 'locationPrecision': 'city',
            'locationRole': 'brewery_city_reference', 'year': None, 'website': homepage,
            'description': f"{display_city} 的城市级参考位置，不是精确厂址，也不代表每款酒的实际生产地点。",
            'sourceUrls': ref['sourceUrls'], 'sourceNote': ref['verificationNote'],
            'sourceIds': [source['id']], 'locationEvidence': ref,
            'sourceRecord': source, 'craftStatus': 'unknown', 'operatingStatus': 'unknown',
        }
        if source.get('catalog_role'):
            brewery['catalogRole'] = source['catalog_role']
        if any(batch in ref.get('coordinateEvidenceFile', '') for batch in ['beertasting-regions-', 'beertasting-density-', 'beertasting-quality-']):
            brewery['description'] = ref['verificationNote']
            brewery['operatingStatus'] = ref.get('operatingStatus', 'unknown')
            # Some source province fields contradict their reviewed city.
            # Keep those originals in sourceRecord; only expose a reviewed
            # province as normalized region data for this regional batch.
            brewery['region'] = ref.get('reviewedRegion')
        breweries.append(brewery)
    beers = []
    cache = {r['sourceUrl']: r for r in (image_cache or {}).get('records', [])}
    introductions = {r['id']: r for r in (descriptions or {}).get('records', [])}
    for row in records:
        introduction = introductions.get(row['id'])
        if introduction:
            assert introduction['brewery_id'] == row['brewery_id'], 'Description must match the exact source brewery'
            assert introduction['productUrl'] == row['url'], 'Description must match the exact source beer'
            assert isinstance(introduction['description'], str) and introduction['description'].strip()
            assert len(introduction['sourceSha256']) == 64 and introduction['sourceUrl'].startswith('https://')
        candidate = candidate_image(row)
        cached, cache_status = cached_image(row, cache)
        image = cached['card']['path'] if cached else None
        flags = ['craft_status_unknown', 'brewery_city_reference', 'flavors_not_provided',
                 'ingredients_not_provided', 'fermentation_not_provided', 'image_rights_unverified']
        if not candidate:
            flags.append('source_placeholder_excluded' if row['image_class'] == 'placeholder' else 'image_unavailable')
        elif not cached:
            flags.append('candidate_image_' + cache_status)
        else:
            flags.append('local_candidate_image_identity_unverified')
        if row['ibu_raw'] == 0:
            flags.append('ibu_zero_treated_as_unknown')
        if row['style'] is None:
            flags.append('style_unknown')
        beer = {
            'id': 'beertasting-' + row['id'], 'name': row['display_name'] or row['name'],
            'breweryId': 'beertasting-brewery-' + row['brewery_id'], 'collection': 'beertasting',
            'style': row['style'] or 'Unclassified Beer', 'styleZh': row['style'] or '风格待核对',
            'sourceCategory': row['style_family'],
            'abv': number(row['abv_percent']), 'ibu': number(row['ibu_raw'], positive=True), 'srm': None,
            'description': readable_description(introduction['description']) if introduction else '',
            'originalDescription': introduction['description'] if introduction else '', 'flavors': [], 'flavorEvidence': [],
            'hops': [], 'malts': [], 'yeast': None, 'fermentation': None, 'foodPairings': [], 'firstBrewed': None,
            'image': image, 'imageThumbnail': cached['map']['path'] if cached else None,
            'imageOriginal': cached['original']['path'] if cached else None,
            'imageCacheStatus': cache_status,
            'imageDownloadUrl': candidate, 'imageSource': row['url'] if candidate else None,
            'imageCredit': 'BeerTasting 来源候选图片；本地缓存不代表身份或再利用许可已核实。' if candidate else None,
            'imageLicenseUrl': None,
            'imageEvidence': {'sourceClass': row['image_class'], 'mediaId': row['image_media_id'],
                              'declaredMime': row['image_declared_mime'], 'downloadedForDemo': bool(cached),
                              'individuallyVerified': False, 'reuseRightsVerified': False,
                              'cacheStatus': cache_status,
                              'cacheManifestUrl': '/data-sources/beertasting/image-cache.json',
                              'originalSha256': cached['original']['sha256'] if cached else None,
                              'mapDimensions': [cached['map']['width'], cached['map']['height']] if cached else None,
                              'cardDimensions': [cached['card']['width'], cached['card']['height']] if cached else None},
            'rating': row['rating'], 'ratingsCount': row['ratings_count'],
            'isRetired': row['is_retired'], 'isDraught': row['is_draught'],
            'sourceUrls': list(dict.fromkeys([row['url'], row['source_url']])),
            'sourceNote': EXPANSION_NOTE if row.get('collection_method') == 'direct_public_html' else SOURCE_NOTE,
            'collectionMethod': row.get('collection_method', 'genuine_ids_with_public_page_metadata'),
            'collectionBatch': row.get('collection_batch', 'ids_pilot_20260918'), 'sourceIds': [row['id']],
            'sourceRecord': public_record(row), 'sourceDataUrl': '/data-sources/beertasting/source-records.json',
            'locationEvidence': refs[row['brewery_id']], 'craftStatus': 'unknown',
            'operatingStatus': 'unknown', 'dataLicense': None, 'dataQualityFlags': flags,
        }
        if introduction:
            beer['descriptionEvidence'] = {key: introduction[key] for key in
                ['sourceUrl', 'productUrl', 'sourceSha256', 'sourceFile', 'sourceFieldPath', 'sourceKind']}
            beer['sourceUrls'] = list(dict.fromkeys([*beer['sourceUrls'], introduction['sourceUrl']]))
        role = row.get('catalog_role') or raw_breweries[row['brewery_id']].get('catalog_role')
        if role:
            beer['catalogRole'] = role
            beer['dataQualityFlags'].append(role)
            if role == 'industrial_reference':
                beer['sourceNote'] += ' 此条为大型酒厂地区风格参照，不能归称已认证独立精酿。'
            elif role == 'microbrewery_group_owned':
                beer['sourceNote'] += ' 来源标为集团所属的小型酒厂，未归称独立精酿。'
            elif role == 'group_owned_craft_reference':
                beer['sourceNote'] += ' 公开历史资料记载此精酿品牌被集团收购；未认证独立所有权或当前股权。'
        beers.append(beer)
    counts = {'beers': len(beers), 'breweries': len(breweries),
              'candidateImages': sum(candidate_image(r) is not None for r in records),
              'cachedImages': sum(b['image'] is not None for b in beers),
              'failedImageCaches': sum(b['imageCacheStatus'] in ['failed', 'cache_invalid'] for b in beers),
              'pendingImageCaches': sum(b['imageCacheStatus'] == 'not_cached' for b in beers),
              'missingImages': sum(b['sourceRecord']['image_class'] == 'missing' for b in beers),
              'excludedPlaceholders': sum(b['sourceRecord']['image_class'] == 'placeholder' for b in beers),
              'mappedBeers': len(beers), 'cityReferences': len(breweries),
              'countriesOrRegions': len({b['countryCode'] for b in breweries}),
              'continents': len({r['sampling_continent'] for r in records}),
              'abv': sum(b['abv'] is not None for b in beers), 'positiveIbu': sum(b['ibu'] is not None for b in beers),
              'ibuZeroPreservedAsUnknown': sum(r['ibu_raw'] == 0 for r in records),
              'sourceStyles': len({r['style'] for r in records if r['style']}),
              'missingStyles': sum(r['style'] is None for r in records)}
    counts['originalPilotBeers'] = sum(not r.get('collection_method') for r in records)
    counts['descriptions'] = sum(bool(b['description']) for b in beers)
    counts['cachedImagesWithDescriptions'] = sum(bool(b['image'] and b['description']) for b in beers)
    counts['publicHtmlExpansionBeers'] = sum(r.get('collection_method') == 'direct_public_html' for r in records)
    assert counts['originalPilotBeers'] == 1000
    metadata = {
        'collection': 'beertasting', 'title': f'BeerTasting {len(beers):,} 款公开目录',
        'sourceCapturedAt': pilot.get('updated_at'), 'source': 'https://www.beertasting.com/',
        'method': pilot.get('method'), 'batches': pilot.get('batches', []), 'counts': counts,
        'scopeNote': f"原始 IDS 1000 条完整保留，另有 {counts['publicHtmlExpansionBeers']} 条普通公开 HTML 地理扩采；总计 {len(breweries)} 家、{counts['continents']} 洲。不是全球全量目录，也未认证全部为独立精酿。",
        'locationNote': '全部为城市或聚落级参考点，不是精确厂址或逐款生产地。',
        'imageNote': f"{counts['candidateImages']} 个非占位候选图片记录；成功缓存后使用本地原图及 WebP 缩略图，失败与未缓存项显示无图，不回退热链。缓存不等于逐张图像身份核验。",
        'imageCacheManifestUrl': '/data-sources/beertasting/image-cache.json',
        'license': {'database': None, 'images': None, 'note': '未取得全库或图片再利用授权；未将其标注为开放许可。'},
        'sourceDataUrl': '/data-sources/beertasting/source-records.json',
        'locationDataUrl': '/data-sources/beertasting/brewery-locations.json',
        'sourceNoticeUrl': '/data-sources/beertasting/NOTICE.md',
    }
    return {'metadata': metadata, 'breweries': breweries, 'beers': beers}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=PILOT / 'beers.json')
    parser.add_argument('--breweries', type=Path, default=PILOT / 'breweries.json')
    parser.add_argument('--locations', type=Path, default=SOURCE / 'brewery-locations.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/data/beertasting.json')
    parser.add_argument('--image-cache', type=Path, default=CACHE_MANIFEST)
    parser.add_argument('--expansion', type=Path, default=EXPANSION)
    parser.add_argument('--regions', type=Path, default=REGIONS)
    parser.add_argument('--density', type=Path, default=DENSITY)
    parser.add_argument('--quality', type=Path, default=QUALITY)
    parser.add_argument('--descriptions', type=Path, default=DESCRIPTIONS)
    args = parser.parse_args()
    pilot, breweries, references = load(args.input), load(args.breweries), load(args.locations)
    assert len(pilot['records']) == 1000, 'The original IDS pilot must stay intact'
    baseline_ids = {row['id'] for row in pilot['records']}
    batches = [{k: v for k, v in pilot.items() if k != 'records'}]
    for directory in [args.expansion, args.regions, args.density, args.quality]:
        if not (directory / 'beers.json').exists():
            continue
        expansion = load(directory / 'beers.json')
        extra_breweries = load(directory / 'breweries.json')
        assert not baseline_ids.intersection(row['id'] for row in expansion['records']), 'Expansion overlaps original IDs'
        assert all(row.get('collection_method') == 'direct_public_html' and row.get('source_page_sha256')
                   and not any(key.startswith('ids_') for key in row) for row in expansion['records'])
        batches.append({k: v for k, v in expansion.items() if k != 'records'})
        baseline_ids.update(row['id'] for row in expansion['records'])
        pilot = {**pilot, 'method': 'genuine_ids_pilot_plus_direct_public_html_expansion',
                 'updated_at': max(pilot['updated_at'], expansion['updated_at']),
                 'records': [*pilot['records'], *expansion['records']],
                 'field_provenance': 'Original 1000 records retain genuine IDS provenance. Expansion records explicitly state direct_public_html and their source-page hash.',
                 'selection': 'Preserved original IDS pilot followed by geographically targeted public HTML batches.'}
        makers = {row['id']: row for row in breweries['records']}
        for row in extra_breweries['records']:
            # Later sampling can add beers to an already reviewed brewery.
            # Keep its earlier geographic identity and evidence unchanged.
            makers.setdefault(row['id'], row)
        breweries = {**breweries, 'records': list(makers.values())}
        breweries['count'] = len(breweries['records'])
    pilot['batches'] = batches
    pilot['selected_count'] = len(pilot['records'])
    cache = load(args.image_cache) if args.image_cache.exists() else None
    descriptions = load(args.descriptions) if args.descriptions.exists() else None
    result = build(pilot, breweries, references, cache, descriptions)
    clean_pilot = {k: v for k, v in pilot.items() if k != 'records'}
    clean_pilot['records'] = [public_record(row) for row in pilot['records']]
    dump(SOURCE / 'source-records.json', clean_pilot)
    dump(SOURCE / 'source-breweries.json', breweries)
    dump(args.output, result)
    print(json.dumps(result['metadata']['counts'], ensure_ascii=False))


if __name__ == '__main__':
    main()
