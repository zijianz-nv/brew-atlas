#!/usr/bin/env python3
"""Expand the archive using distinct original bottle/can images, no signup.

Preserves the initial 32 hand-edited records byte-for-byte at object level.
Additional descriptions stay in English; flavor tags have explicit lexical
evidence and are not inferred from hop varieties or numeric recipe parameters.
Images are saved without editing. At most six network requests run together.
"""
import concurrent.futures
import hashlib
import json
import pathlib
import re
import struct
import time
import urllib.request
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data/archive.json'
API = 'https://punkapi-alxiw.amvera.io/v3/'
REPO = 'https://github.com/alxiw/punkapi'
PDF = 'https://brewdogmedia.s3.eu-west-2.amazonaws.com/docs/2019+DIY+DOG+-+V8.pdf'
LICENSE = 'https://github.com/sammdec/punkapi/blob/master/LICENSE'
ORIGINAL_IDS = {1,4,14,21,26,29,32,37,55,56,69,70,77,84,99,101,120,144,155,196,199,211,215,247,268,310,357,364,366,387,410,413}

FLAVOR_TERMS = {
    '柑橘': r'citrus|grapefruit|grapefruits|orange|oranges|tangerine|tangerines|lemon|lemons|lime|limes|yuzu|mandarin|mandarins',
    '热带水果': r'tropical(?: fruit)?s?|pineapple|pineapples|mango|mangoes|passion\s?fruit|papaya|papayas|lychee|lychees|guava|guavas',
    '莓果': r'berr(?:y|ies)|raspberr(?:y|ies)|blackberr(?:y|ies)|blueberr(?:y|ies)|strawberr(?:y|ies)|cranberr(?:y|ies)|blackcurrant|blackcurrants|redcurrant|redcurrants|cloudberr(?:y|ies)',
    '核果': r'stone\s?fruit|peach|peaches|apricot|apricots|nectarine|nectarines|cherr(?:y|ies)|plum|plums',
    '果干': r'raisin|raisins|prune|prunes|dried fruit|fig|figs',
    '松针': r'pine|piney|pine\s?needle(?:s)?',
    '树脂': r'resin|resinous',
    '焦糖': r'caramel|toffee|butterscotch',
    '烘烤': r'roast(?:y|ed)?|toasted|toast|biscuit|biscuity',
    '咖啡': r'coffee|espresso|mocha',
    '巧克力': r'chocolate|chocolatey|chocolaty|cocoa|cacao',
    '香草': r'vanilla',
    '椰子': r'coconut|coconuts',
    '花香': r'floral|flowery|jasmine|lavender|elderflower|rose petal(?:s)?',
    '香料': r'spice|spices|spicy|spiced|clove|cloves|cinnamon|ginger|peppercorn(?:s)?|nutmeg|cardamom',
    '酸爽': r'sour|tart|tartness|tangy',
    '烟熏': r'smoke|smoky|smokey|smoked|woodsmoke|peat|peaty',
    '麦香': r'malty|malt(?:y)? (?:flavour|flavor|character|aroma|backbone|sweetness|base)',
    '蜂蜜': r'honey',
    '糖蜜': r'molasses|treacle',
    '坚果': r'nutty|hazelnut|hazelnuts|almond|almonds|pecan|pecans',
    '果香': r'fruity|fruitiness',
    '清爽': r'crisp|crispness|refreshing',
    '顺滑': r'smooth|silky|velvet|velvety',
    '酒花': r'hoppy|hop-forward',
}

STYLES = [
    (r'barrel.?aged.*imperial stout', 'Barrel-aged Imperial Stout', '桶陈帝国世涛'),
    (r'oatmeal milk stout', 'Oatmeal Milk Stout', '燕麦牛奶世涛'),
    (r'milk stout', 'Milk Stout', '牛奶世涛'),
    (r'oatmeal stout', 'Oatmeal Stout', '燕麦世涛'),
    (r'russian imperial stout', 'Russian Imperial Stout', '俄罗斯帝国世涛'),
    (r'imperial stout', 'Imperial Stout', '帝国世涛'),
    (r'berliner\s+weisse', 'Berliner Weisse', '柏林小麦'),
    (r'sour\s+ipa', 'Sour IPA', '酸 IPA'),
    (r'new england\s+(?:india pale ale|ipa)|vermont(?:.style)?\s+(?:india pale ale|ipa)', 'New England IPA', '新英格兰 IPA'),
    (r'(?:triple|quadruple)\s+ipa', 'Triple IPA', '多倍 IPA'),
    (r'(?:double|imperial)\s+(?:ipa|india pale ale)', 'Imperial IPA', '帝国 IPA'),
    (r'black\s+(?:ipa|india pale ale)', 'Black IPA', '黑 IPA'),
    (r'west coast\s+(?:ipa|india pale ale)', 'West Coast IPA', '西海岸 IPA'),
    (r'session\s+(?:ipa|india pale ale)', 'Session IPA', '轻盈 IPA'),
    (r'single.?hop(?:ped)?\s+(?:ipa|india pale ale)', 'Single-hop IPA', '单一酒花 IPA'),
    (r'\bipa\b|india pale ale', 'IPA', 'IPA'),
    (r'baltic porter', 'Baltic Porter', '波罗的海波特'),
    (r'\bporter\b', 'Porter', '波特'),
    (r'\bstout\b', 'Stout', '世涛'),
    (r'barley\s?wine', 'Barley Wine', '大麦酒'),
    (r'scotch ale', 'Scotch Ale', '苏格兰艾尔'),
    (r'scottish sour ale', 'Scottish Sour Ale', '苏格兰酸艾尔'),
    (r'\bsour\b', 'Sour Ale', '酸艾尔'),
    (r'\bsaison\b', 'Saison', '赛松'),
    (r'\bwitbier\b', 'Witbier', '比利时小麦'),
    (r'\bgose\b', 'Gose', '古斯'),
    (r'\bpilsner\b|\bpils\b', 'Pilsner', '皮尔森'),
    (r'\bhelles\b', 'Helles', '德式淡色拉格'),
    (r'\bm[aä]rzen\b', 'Märzen', '三月啤酒'),
    (r'\bbock\b', 'Bock', '博克'),
    (r'\blager\b', 'Lager', '拉格'),
    (r'wheat beer|weizen', 'Wheat Beer', '小麦啤酒'),
    (r'brown ale', 'Brown Ale', '棕色艾尔'),
    (r'red ale|amber ale', 'Amber Ale', '琥珀艾尔'),
    (r'pale ale', 'Pale Ale', '淡色艾尔'),
    (r'\btripel\b', 'Tripel', '三料'),
    (r'\bdubbel\b', 'Dubbel', '双料'),
]


def get(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'BrewAtlas-noncommercial-demo/1.0'})
            with urllib.request.urlopen(request, timeout=40) as response:
                return response.read(), response.headers.get('Content-Type', '')
        except Exception:
            if attempt == 2:
                raise
            time.sleep(0.6 * (attempt + 1))


def png_info(content):
    if not content.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Invalid PNG signature')
    offset, dimensions, complete = 8, None, False
    while offset + 12 <= len(content):
        length = struct.unpack('>I', content[offset:offset+4])[0]
        tag = content[offset+4:offset+8]
        chunk = content[offset+4:offset+8+length]
        crc_offset = offset+8+length
        if crc_offset+4 > len(content):
            raise ValueError('Truncated PNG')
        expected = struct.unpack('>I', content[crc_offset:crc_offset+4])[0]
        if zlib.crc32(chunk) & 0xffffffff != expected:
            raise ValueError('PNG CRC mismatch')
        if tag == b'IHDR':
            dimensions = struct.unpack('>II', content[offset+8:offset+16])
        if tag == b'IEND':
            complete = True
            break
        offset = crc_offset+4
    if not complete or not dimensions or min(dimensions) < 100:
        raise ValueError(f'Incomplete or too-small PNG: {dimensions}')
    return dimensions


def extract_flavors(raw):
    evidence = []
    fields = {key: raw.get(key, '') for key in ['name', 'tagline', 'description']}
    for tag, terms in FLAVOR_TERMS.items():
        pattern = re.compile(r'\b(?:' + terms + r')\b', re.I)
        matches = []
        for field, text in fields.items():
            for match in pattern.finditer(text):
                matches.append({'field': field, 'term': match.group(0), 'excerpt': text[max(0, match.start()-35):min(len(text), match.end()+45)]})
        if matches:
            evidence.append({'flavor': tag, 'matches': matches[:5]})
    return [item['flavor'] for item in evidence], evidence


def classify_style(raw):
    for field in ['tagline', 'name']:
        text = raw.get(field, '')
        for pattern, english, chinese in STYLES:
            match = re.search(pattern, text, re.I)
            if match:
                return english, chinese, {'field': field, 'term': match.group(0)}
    return 'Beer', '啤酒（档案未分类）', None


def strings(items):
    return list(dict.fromkeys(item.strip() for item in items if isinstance(item, str) and item.strip()))


def new_record(raw):
    ident = raw['id']
    flavors, evidence = extract_flavors(raw)
    style, style_zh, style_evidence = classify_style(raw)
    ingredients = raw.get('ingredients', {})
    flags = []
    if raw.get('ibu') is not None and raw['ibu'] > 200:
        flags.append('IBU 源值异常高，按历史配方原样保留，待核验。')
    if not flavors:
        flags.append('原文没有匹配到明确感官词，风味标签留空。')
    return {
        'id': f'archive-{ident:03}', 'name': raw['name'], 'breweryId': 'brewdog-ellon',
        'style': style, 'styleZh': style_zh, 'styleEvidence': style_evidence,
        'abv': raw.get('abv'), 'ibu': raw.get('ibu'), 'srm': raw.get('srm'),
        'description': raw['description'], 'descriptionLanguage': 'en',
        'originalDescription': raw['description'], 'flavors': flavors, 'flavorEvidence': evidence,
        'flavorMethod': 'explicit-source-keyword-match-v1; name/tagline/description only; not human sensory evaluation',
        'hops': strings(item.get('name') for item in ingredients.get('hops', [])),
        'malts': strings(item.get('name') for item in ingredients.get('malt', [])),
        'yeast': ingredients.get('yeast') or None,
        'foodPairings': strings(raw.get('food_pairing', [])),
        'firstBrewed': raw.get('first_brewed') or None,
        'image': f'/images/archive-{ident:03}.png',
        'imageSource': API + 'images/' + raw['image'],
        'imageCredit': 'BrewDog · DIY Dog V8；alxiw/punkapi 提取；仅非商业原型测试，非 MIT 品牌素材授权',
        'sourceUrls': [API + f'beers/{ident}', REPO, PDF, LICENSE],
        'sourceNote': 'DIY Dog 历史配方；新增记录保留英文原描述。风味为原文明确词语的自动匹配，附匹配依据，未经人工感官复核；没有匹配则留空。不表示当前在售数据。地图按 BrewDog 品牌归档至 Ellon，不表示每个历史批次最初均在此生产。',
        'collection': 'archive', 'dataQualityFlags': flags, 'sourceRecord': raw,
    }


def image_record(raw):
    path = ROOT / 'public/images' / f"archive-{raw['id']:03}.png"
    cached = path.is_file()
    try:
        if cached:
            content = path.read_bytes()
        else:
            content, media_type = get(API + 'images/' + raw['image'])
            if not media_type.startswith('image/png'):
                raise ValueError(f'Unexpected media type {media_type}')
        size = png_info(content)
        if not cached:
            path.write_bytes(content)
        return {'raw': raw, 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content), 'dimensions': size, 'cached': cached}
    except Exception as error:
        return {'raw': raw, 'error': str(error)}


def main():
    current = json.loads(DATA.read_text())
    original = {int(item['id'].split('-')[-1]): item for item in current['beers'] if int(item['id'].split('-')[-1]) in ORIGINAL_IDS}
    assert len(original) == 32, 'The original 32 hand-edited records must be present.'
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        pages = list(executor.map(lambda page: json.loads(get(API + f'beers?page={page}&per_page=80')[0]), range(1, 7)))
    source = [item for page in pages for item in page]
    assert len(source) == 415 and len({item['id'] for item in source}) == 415
    generic = [item for item in source if not re.fullmatch(r'\d+\.png', item.get('image', ''))]
    candidates = [item for item in source if re.fullmatch(r'\d+\.png', item.get('image', ''))]
    print(json.dumps({'sourceRecords': len(source), 'candidateBottleCanRecords': len(candidates), 'genericExcluded': len(generic)}, ensure_ascii=False), flush=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        for index, result in enumerate(executor.map(image_record, candidates), 1):
            results.append(result)
            if index % 25 == 0:
                print(f'Checked {index}/{len(candidates)} images', flush=True)
    # Prefer the original human-edited record if image bytes are duplicated.
    results.sort(key=lambda item: (item['raw']['id'] not in ORIGINAL_IDS, item['raw']['id']))
    accepted, excluded, hashes = [], [], set()
    for result in results:
        if 'error' in result or result.get('sha256') in hashes:
            if result['raw']['id'] in ORIGINAL_IDS:
                raise RuntimeError(f'Original image must remain usable: {result}')
            excluded.append(result)
            continue
        hashes.add(result['sha256'])
        accepted.append(result)
    accepted.sort(key=lambda item: item['raw']['id'])
    beers = [original.get(item['raw']['id']) or new_record(item['raw']) for item in accepted]
    for ident, beer in original.items():
        assert next(item for item in beers if item['id'] == beer['id']) == beer
    assert len(beers) >= 200
    DATA.write_text(json.dumps({'breweries': current['breweries'], 'beers': beers}, ensure_ascii=False, indent=2) + '\n')
    counts = {
        'sourceRecords': len(source), 'archiveRecords': len(beers), 'originalChineseRecords': len(original),
        'addedEnglishRecords': len(beers)-len(original), 'genericExcluded': len(generic),
        'otherImageExclusions': len(excluded), 'uniqueImages': len(hashes),
        'withFlavorTags': sum(bool(item['flavors']) for item in beers),
        'withoutFlavorTags': sum(not item['flavors'] for item in beers),
        'unclassifiedStyle': sum(item['style'] == 'Beer' for item in beers),
        'totalImageBytes': sum(item['bytes'] for item in accepted),
        'abvRange': [min(item['abv'] for item in beers if item['abv'] is not None), max(item['abv'] for item in beers if item['abv'] is not None)],
        'ibuZeroIds': [item['id'] for item in beers if item['ibu'] == 0],
    }
    lines = ['# BrewDog archive sources', '', 'Expanded: 2026-09-14. Purpose: local non-commercial interactive demo. No credentials, registration or paid service.', '', '## Scope and verified counts', '', '```json', json.dumps(counts, ensure_ascii=False, indent=2), '```', '',
        'The 32 initial hand-edited Chinese records and the brewery object are preserved unchanged. Additional entries keep the original English description and food-pairing text. Their complete source API record is retained in `sourceRecord`.', '',
        'The complete 415-record source includes 88 keg.png entries and 2 cask.png entries. These are generic packaging illustrations and are excluded. Remaining numerical PNG filenames are downloaded and checked; images with duplicate bytes, damaged structure, invalid PNG CRCs or dimensions below 100px are excluded. No image is edited or resized.', '',
        '## Data and image provenance', '', f'- API / code: [{REPO}]({REPO}). All six catalogue pages were fetched without credentials.', f'- Upstream recipe and image publication: [BrewDog DIY Dog V8]({PDF}).', f'- [Original Punk API data license]({LICENSE}) allows free use, verbatim replication and sharing but excludes commercial use. MIT software licensing does not supply a commercial license to BrewDog images or brands.',
        '- Image files are original source PNGs, saved locally for the requested demo; each accepted file passed a PNG signature, chunk CRC, dimensions and SHA256 uniqueness check.',
        '- Values describe archival recipes, not current commercial packaging. Nulls remain null. One explicit IBU zero is preserved; unusually high source IBU values are retained with quality flags in new records, rather than silently changed.', '',
        '## Flavor and style derivation', '',
        '- Existing 32 Chinese records retain their hand-edited descriptions and tags.',
        '- New records only match explicit words in `name`, `tagline` and `description`. `flavorEvidence` includes the source field, exact matched term and nearby excerpt. `flavorMethod` identifies this automatic process.',
        '- No flavors are inferred from hop varieties, malt varieties, ABV, IBU, SRM, food pairings or learned style averages. No numeric sensory scores are produced.',
        '- No matching sensory term means `flavors: []`. Keywords are a transparent reading aid, not verified tasting-panel findings. They may denote an ingredient explicitly named by the brewer; the UI must not turn them into unsupported numeric intensity claims.',
        '- Style is assigned only when the source name or tagline explicitly names a recognizable style. `styleEvidence` records the matched term. Otherwise style is `Beer` / `啤酒（档案未分类）`.',
        '- Tests must permit missing flavor tags and the source-verified zero IBU of archive-095. They should continue rejecting generic/reused images, fabricated scores and orphan brewery links.', '',
        '## Brewery location and historical scope', '',
        '- [Official brewery contact](https://brewdog.com/pages/customer-service-contact-us): Balmacassie Industrial Estate, Ellon, Aberdeenshire AB41 8BX.',
        '- [Historic Environment Scotland record 320338](https://www.trove.scot/place/320338?display=image): brewery reference point 57.37214, -2.05818, approximately 100 metre precision. This is not an entrance/navigation pin.',
        '- [BrewDog DIY Dog introduction](https://efp.brewdog.com/es/blog/diy-dog) describes the original Fraserburgh brewery. Ellon is a brand archive hub in this prototype; it does not claim every historical recipe originated or was physically brewed there.',
        '- All archive records belong to BrewDog. They are not distributed among unrelated global brewery markers. The archive label and historical-source note must remain visible.',
        '- Brewery year remains null to avoid conflating brand founding with the Ellon site opening.', '',
        '## Accepted image audit', '', '| ID | Beer | API | Source image | Dimensions | Bytes | SHA256 |', '|---|---|---|---|---|---:|---|']
    for result in accepted:
        raw = result['raw']
        lines.append(f"| archive-{raw['id']:03} | {raw['name'].replace('|', '/')} | [JSON]({API}beers/{raw['id']}) | [PNG]({API}images/{raw['image']}) | {result['dimensions'][0]}×{result['dimensions'][1]} | {result['bytes']} | `{result['sha256']}` |")
    if excluded:
        lines += ['', '## Additional exclusions', '']
        for item in excluded:
            lines.append(f"- {item['raw']['id']} {item['raw']['name']}: {item.get('error', 'duplicate image SHA256')}")
    lines += ['', 'Reproduce with `python3 scripts/expand-archive.py`; downloads are limited to six simultaneous requests. Existing validated image files are reused. `scripts/collect-archive.py` remains the original 32-record collector and now refuses to overwrite an expanded archive; use the expansion script for this enlarged archive.', '', 'Commercial or public production deployment requires a separate authorization decision for data and imagery; this prototype does not confer those rights.']
    (ROOT / 'research/ARCHIVE-SOURCES.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps(counts, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
