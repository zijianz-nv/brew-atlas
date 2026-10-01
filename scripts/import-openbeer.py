#!/usr/bin/env python3
"""Import the openly licensed, historical Open Beer Database CSV snapshot.

No signup, API key, image generation, brewery geocoding, or flavor inference.
Run with --refresh to download source files again; otherwise reuse their bytes.
"""
from pathlib import Path
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import argparse
import csv
import hashlib
import html
import json
import math
import re
import unicodedata
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / 'public/data-sources/openbeer'
OUTPUT = ROOT / 'public/data/openbeer.json'
REPO = 'https://github.com/brewdega/open-beer-database-dumps'
RAW = 'https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/'
ODBL = 'https://opendatacommons.org/licenses/odbl/1-0/'
DBCL = 'https://opendatacommons.org/licenses/dbcl/1-0/'
FILES = ['README.md'] + ['dumps/' + f + '.csv' for f in ['beers', 'breweries', 'styles', 'categories', 'geocodes']]

# Country/region labels are display normalization, not a claim of current borders.
COUNTRIES = {
    'Argentina': ('AR', '阿根廷'), 'Aruba': ('AW', '阿鲁巴'), 'Australia': ('AU', '澳大利亚'),
    'Austria': ('AT', '奥地利'), 'Belgium': ('BE', '比利时'), 'Belize': ('BZ', '伯利兹'),
    'Brazil': ('BR', '巴西'), 'Canada': ('CA', '加拿大'), 'China': ('CN', '中国'),
    'Colombia': ('CO', '哥伦比亚'), 'Croatia': ('HR', '克罗地亚'), 'Cuba': ('CU', '古巴'),
    'Czechia': ('CZ', '捷克'), 'Denmark': ('DK', '丹麦'), 'Egypt': ('EG', '埃及'),
    'El Salvador': ('SV', '萨尔瓦多'), 'Estonia': ('EE', '爱沙尼亚'), 'Finland': ('FI', '芬兰'),
    'France': ('FR', '法国'), 'French Polynesia': ('PF', '法属波利尼西亚'), 'Germany': ('DE', '德国'),
    'Greece': ('GR', '希腊'), 'Guatemala': ('GT', '危地马拉'), 'Honduras': ('HN', '洪都拉斯'),
    'Hungary': ('HU', '匈牙利'), 'India': ('IN', '印度'), 'Ireland': ('IE', '爱尔兰'),
    'Israel': ('IL', '以色列'), 'Italy': ('IT', '意大利'), 'Jamaica': ('JM', '牙买加'),
    'Japan': ('JP', '日本'), 'Kenya': ('KE', '肯尼亚'), 'South Korea': ('KR', '韩国'),
    'Latvia': ('LV', '拉脱维亚'), 'Lithuania': ('LT', '立陶宛'), 'Macao': ('MO', '中国澳门'),
    'North Macedonia': ('MK', '北马其顿'), 'Mauritius': ('MU', '毛里求斯'), 'Mexico': ('MX', '墨西哥'),
    'Myanmar': ('MM', '缅甸'), 'Namibia': ('NA', '纳米比亚'), 'Netherlands': ('NL', '荷兰'),
    'New Zealand': ('NZ', '新西兰'), 'Norway': ('NO', '挪威'), 'Panama': ('PA', '巴拿马'),
    'Philippines': ('PH', '菲律宾'), 'Poland': ('PL', '波兰'), 'Portugal': ('PT', '葡萄牙'),
    'Russia': ('RU', '俄罗斯'), 'Serbia and Montenegro': (None, '塞尔维亚和黑山（历史）'),
    'Sierra Leone': ('SL', '塞拉利昂'), 'Slovakia': ('SK', '斯洛伐克'), 'Spain': ('ES', '西班牙'),
    'Sri Lanka': ('LK', '斯里兰卡'), 'Sweden': ('SE', '瑞典'), 'Switzerland': ('CH', '瑞士'),
    'Taiwan': ('TW', '中国台湾'), 'Thailand': ('TH', '泰国'), 'Togo': ('TG', '多哥'),
    'United Kingdom': ('GB', '英国'), 'United States': ('US', '美国'), 'Vietnam': ('VN', '越南'),
}
COUNTRY_ALIASES = {
    'England': 'United Kingdom', 'Scotland': 'United Kingdom', 'Wales': 'United Kingdom',
    'Northern Ireland': 'United Kingdom', 'Czech Republic': 'Czechia',
    'Korea, Republic of': 'South Korea', 'Macedonia, the Former Yugoslav Republic of': 'North Macedonia',
    'Taiwan, Province of China': 'Taiwan', 'Viet Nam': 'Vietnam',
}

# Source style IDs 1–141, translated labels only; no sensory scores are inferred.
STYLE_ZH = dict(enumerate('''经典英式淡色艾尔|英式 IPA|普通苦啤|特选苦啤|特浓苦啤 ESB|英式夏日艾尔|苏格兰轻型艾尔|苏格兰厚重艾尔|苏格兰出口艾尔|英式淡色温和艾尔|英式深色温和艾尔|英式棕色艾尔|老艾尔|烈性艾尔|苏格兰烈性艾尔|英式帝国世涛|英式大麦酒|浓郁波特|棕色波特|甜世涛|燕麦世涛|爱尔兰红色艾尔|经典爱尔兰干世涛|出口型世涛|波特|美式淡色艾尔|鲜酒花艾尔|美式比利时淡色艾尔|美式比利时深色艾尔|美式强劲淡色艾尔|美式 IPA|帝国／双倍 IPA|美式琥珀／红色艾尔|帝国／双倍红色艾尔|美式大麦酒|美式小麦烈酒|金色艾尔|美式棕色艾尔|烟熏波特|美式酸艾尔|美式黑色 IPA|美式世涛|美式帝国世涛|特殊世涛|美式帝国波特|波特|德式科隆啤酒|柏林白啤|莱比锡古斯|南德浑浊小麦啤酒|南德水晶小麦啤酒|德式轻型小麦啤酒|南德琥珀小麦啤酒|南德深色小麦啤酒|南德小麦博克|班贝格烟熏小麦啤酒|德式棕色艾尔／老啤酒|窖藏艾尔|比利时法兰德斯酸棕艾尔|比利时双料|比利时三料|比利时四料|比利时金色艾尔|比利时淡色艾尔|比利时淡色烈性艾尔|比利时深色烈性艾尔|比利时白啤|比利时兰比克|比利时贵兹兰比克|比利时水果兰比克|比利时餐桌啤酒|其他比利时艾尔|法式守护啤酒|法国／比利时赛松|国际淡色艾尔|澳新淡色艾尔|德式皮尔森|波希米亚皮尔森|欧洲低酒精拉格|慕尼黑淡色拉格|多特蒙德／欧洲出口拉格|维也纳拉格|德式三月啤酒|德式啤酒节啤酒|欧洲深色拉格|德式黑啤|班贝格三月啤酒|班贝格淡色烟熏拉格|班贝格烟熏博克|传统德式博克|德式淡色／五月博克|德式双倍博克|德式冰博克|窖藏拉格|美式拉格|美式淡爽拉格|美式低碳水淡爽拉格|美式琥珀拉格|美式优质拉格|美式皮尔森|美式冰拉格|美式麦芽烈性啤酒|美式琥珀拉格|美式三月／啤酒节啤酒|美式深色拉格|波罗的海波特|澳新淡爽拉格|拉美淡爽拉格|热带淡爽拉格|国际皮尔森|干拉格|轻饮型啤酒|美式奶油艾尔或拉格|加州普通啤酒|日本清酒酵母啤酒|美式淡色小麦艾尔或拉格|水果小麦艾尔或拉格|美式深色小麦艾尔或拉格|美式黑麦艾尔或拉格|德式黑麦艾尔|水果啤酒|田园蔬菜啤酒|南瓜啤酒|巧克力／可可风味啤酒|咖啡风味啤酒|香草与香料啤酒|特色啤酒|特色蜂蜜拉格或艾尔|无麸质啤酒|烟熏啤酒|实验啤酒|其他未归类啤酒|木桶陈酿啤酒|木桶陈酿淡色至琥珀啤酒|木桶陈酿深色啤酒|木桶陈酿烈性啤酒|木桶陈酿酸啤酒|陈年啤酒|其他烈性艾尔或拉格|无醇啤酒|冬季暖身艾尔'''.split('|'), 1))

def clean(value):
    return unicodedata.normalize('NFKC', html.unescape(value or '')).strip()

def normalized_name(value):
    return re.sub(r'\s+', ' ', clean(value)).casefold()

def source_id(value):
    if not value or not re.fullmatch(r'[1-9][0-9]*', value):
        raise ValueError('Invalid positive source id: ' + repr(value))
    return value

def rows(name):
    with (SOURCE_DIR / (name + '.csv')).open(encoding='utf-8-sig', newline='') as file:
        result = list(csv.DictReader(file))
    if not result or any(None in row or '' in row for row in result):
        raise ValueError('Empty/malformed CSV column in ' + name)
    ids = [source_id(row['id']) for row in result]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate source primary id in ' + name)
    return result

def positive(value, maximum):
    try:
        number = float(value)
        return round(number, 4) if math.isfinite(number) and 0 < number <= maximum else None
    except (ValueError, TypeError):
        return None

def consistent_number(group, field, maximum):
    values = {positive(row[field], maximum) for row in group} - {None}
    return (next(iter(values)), False) if len(values) == 1 else (None, len(values) > 1)

def coordinate(row):
    try:
        lat, lng = float(row['latitude']), float(row['longitude'])
        if not math.isfinite(lat) or not math.isfinite(lng) or not (-90 <= lat <= 90 and -180 <= lng <= 180) or (lat == 0 and lng == 0):
            return None
        return round(lat, 7), round(lng, 7)
    except (ValueError, TypeError, KeyError):
        return None

def download(relative, refresh):
    destination = SOURCE_DIR / Path(relative).name
    if refresh or not destination.exists():
        req = urllib.request.Request(RAW + relative, headers={'User-Agent': 'BrewAtlasOpenBeerImport/1.0'})
        with urllib.request.urlopen(req, timeout=45) as response:
            content = response.read(3_000_001)
        if len(content) > 3_000_000:
            raise ValueError('Source unexpectedly exceeds 3 MB: ' + relative)
        destination.write_bytes(content)
    content = destination.read_bytes()
    return {'file': destination.name, 'url': RAW + relative, 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='redownload six small official GitHub source files')
    args = parser.parse_args()
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        manifest_files = list(pool.map(lambda f: download(f, args.refresh), FILES))
    readme = (SOURCE_DIR / 'README.md').read_text()
    if 'Open Database License' not in readme or 'Database Contents License' not in readme:
        raise ValueError('Expected source data license declaration is missing; import stopped')
    all_rows = {name: rows(name) for name in ['beers', 'breweries', 'styles', 'categories', 'geocodes']}
    original_beers, original_breweries = all_rows['beers'], all_rows['breweries']
    styles = {row['id']: row for row in all_rows['styles']}
    categories = {row['id']: row for row in all_rows['categories']}
    geocodes = defaultdict(list)
    rejected_geocodes = []
    for row in all_rows['geocodes']:
        source_id(row['brewery_id'])
        if coordinate(row) is None:
            rejected_geocodes.append(row)
        else:
            geocodes[row['brewery_id']].append(row)
    brewery_source = {row['id']: row for row in original_breweries}
    if any(row['brewery_id'] not in brewery_source for row in original_beers):
        raise ValueError('Beer with absent brewery foreign key; import stopped')
    if any(not clean(row['name']) for row in original_breweries + original_beers):
        raise ValueError('Source contains empty entity name; import stopped for review')

    breweries = []
    for row in original_breweries:
        raw_country = clean(row['country'])
        country = COUNTRY_ALIASES.get(raw_country, raw_country) or 'Unknown'
        country_code, country_zh = COUNTRIES.get(country, (None, '产地未知' if country == 'Unknown' else country))
        locations = geocodes.get(row['id'], [])
        pairs = {coordinate(item) for item in locations}
        pair = next(iter(pairs)) if len(pairs) == 1 else None
        site = clean(row['website'])
        if not re.match(r'^https?://[^\s]+$', site):
            site = None
        breweries.append({
            'id': 'openbeer-brewery-' + row['id'], 'name': clean(row['name']), 'nameZh': clean(row['name']),
            'country': country, 'countryZh': country_zh, 'countryCode': country_code, 'countryRaw': row['country'],
            'city': clean(row['city']), 'region': clean(row['state']), 'address': clean(row['address1']),
            'lat': pair[0] if pair else None, 'lng': pair[1] if pair else None,
            'locationPrecision': 'historical', 'locationRole': 'historical_brewery_reference',
            'locationSourceAccuracy': sorted({item['accuracy'] for item in locations}),
            'locationSourceIds': [item['id'] for item in locations],
            'year': None, 'website': site, 'craftStatus': 'unknown', 'operatingStatus': 'unknown',
            'description': 'Open Beer Database 历史酒厂资料；坐标若有则仅作旧资料参照，未核验现役状态及各酒款实际生产地。',
            'originalDescription': row['descript'], 'sourceIds': [row['id']], 'sourceModified': row['last_mod'],
            'sourceUrls': [REPO + '/blob/master/dumps/breweries.csv', REPO + '/blob/master/dumps/geocodes.csv'],
            'sourceNote': '原 country 标签已另存 countryRaw；历史国家／地区不能等同现今国家覆盖。',
            'dataLicense': 'ODbL-1.0 / DbCL-1.0', 'dataQualityFlags': ([] if pair else ['no_valid_historical_coordinate']) + (['conflicting_source_coordinates'] if len(pairs) > 1 else []),
        })
    brewery_map = {row['id']: row for row in breweries}
    groups = defaultdict(list)
    for row in original_beers:
        groups[(row['brewery_id'], normalized_name(row['name']))].append(row)
    beers, merges = [], []
    for group in groups.values():
        group.sort(key=lambda row: int(row['id']))
        primary = group[0]
        ids = [row['id'] for row in group]
        flags = ['historical_record', 'craft_status_unknown', 'image_unavailable', 'flavors_not_extracted']
        numbers = {}
        for field, maximum in [('abv', 100), ('ibu', 1000), ('srm', 1000)]:
            number, conflict = consistent_number(group, field, maximum)
            numbers[field] = number
            if number is None: flags.append(field + '_unknown')
            if conflict: flags.append(field + '_conflicting_source_values')
        style_ids = {row['style_id'] for row in group if row['style_id'] in styles}
        style_id = next(iter(style_ids)) if len(style_ids) == 1 else None
        style = styles[style_id]['style_name'] if style_id else 'Unclassified Beer'
        if len(style_ids) > 1: flags.append('conflicting_source_styles')
        descriptions = [row['descript'] for row in group if row['descript'].strip()]
        description = descriptions[0] if descriptions else ''
        if not description: flags.append('description_unavailable')
        if len(group) > 1:
            flags.append('merged_same_brewery_and_name')
            merges.append({'canonicalId': 'openbeer-' + primary['id'], 'sourceIds': ids, 'name': clean(primary['name']), 'brewerySourceId': primary['brewery_id']})
        category = categories.get(primary['cat_id'])
        beers.append({
            'id': 'openbeer-' + primary['id'], 'name': clean(primary['name']),
            'breweryId': 'openbeer-brewery-' + primary['brewery_id'],
            'style': style, 'styleZh': STYLE_ZH.get(int(style_id), style) if style_id else '未分类啤酒',
            **numbers, 'description': description, 'originalDescription': description,
            'flavors': [], 'flavorEvidence': [], 'hops': [], 'malts': [], 'yeast': None, 'foodPairings': [],
            'firstBrewed': None, 'image': None, 'imageCredit': None, 'imageSource': None,
            'imageLicenseUrl': None, 'imageDownloadUrl': None,
            'sourceUrls': [REPO + '/blob/master/dumps/beers.csv', REPO + '/blob/master/README.md'],
            'sourceNote': '2010–2011 年历史啤酒目录，英文描述保留源文；未核验精酿身份、现售状态、图片或逐款生产地。数值 0 视为未知；未提取风味标签。',
            'collection': 'openbeer', 'craftStatus': 'unknown', 'operatingStatus': 'unknown',
            'sourceIds': ids, 'sourceModified': [row['last_mod'] for row in group],
            'sourceStyleIds': sorted({row['style_id'] for row in group}),
            'sourceCategory': category['cat_name'] if category else None,
            'sourceDataUrl': '/data-sources/openbeer/beers.csv',
            'dataLicense': 'ODbL-1.0 / DbCL-1.0', 'dataQualityFlags': flags,
        })
    beers.sort(key=lambda row: int(row['sourceIds'][0]))
    used_breweries = {row['breweryId'] for row in beers}
    # Keep all original brewery rows for full source coverage, even without a beer.
    country_counts = Counter(brewery_map[row['breweryId']]['country'] for row in beers)
    located = lambda row: brewery_map[row['breweryId']]['lat'] is not None
    metadata = {
        'schemaVersion': 1, 'collection': 'openbeer', 'title': 'Open Beer 历史啤酒目录',
        'source': 'Open Beer Database · brewdega cleaned CSV snapshot', 'sourceUrl': REPO,
        'sourceDataDirectory': '/data-sources/openbeer/', 'license': {'database': ODBL, 'contents': DBCL},
        'sourceBeerDateRange': {'first': min(row['last_mod'] for row in original_beers), 'last': max(row['last_mod'] for row in original_beers)},
        'rawCounts': {name: len(value) for name, value in all_rows.items()},
        'counts': {
            'beers': len(beers), 'breweries': len(breweries), 'breweriesWithBeers': len(used_breweries),
            'mergedSourceRows': len(original_beers) - len(beers), 'duplicateGroups': len(merges),
            'beerImages': 0, 'beerDescriptions': sum(bool(row['description'].strip()) for row in beers),
            'beerFlavorTags': 0, 'beerAbv': sum(row['abv'] is not None for row in beers),
            'beerIbu': sum(row['ibu'] is not None for row in beers), 'beerSrm': sum(row['srm'] is not None for row in beers),
            'beersWithHistoricalCoordinates': sum(located(row) for row in beers),
            'breweriesWithHistoricalCoordinates': sum(row['lat'] is not None for row in breweries),
            'beerLinkedBreweriesWithHistoricalCoordinates': sum(row['id'] in used_breweries and row['lat'] is not None for row in breweries),
            'breweriesWithConflictingCoordinates': sum('conflicting_source_coordinates' in row['dataQualityFlags'] for row in breweries),
            'beersWithConflictingStyles': sum('conflicting_source_styles' in row['dataQualityFlags'] for row in beers),
            'rawRelativeImagePathsNotImported': sum(bool(row['filepath']) for row in original_beers),
            'beerCountryRegionLabels': len(set(country_counts) - {'Unknown'}),
            'breweryCountryRegionLabels': len({row['country'] for row in breweries} - {'Unknown'}),
            'rawBreweryCountryLabels': len({row['country'] for row in original_breweries if row['country']}),
            'rejectedGeocodes': len(rejected_geocodes), 'verifiedCraftBeers': 0,
        },
        'beersByCountryOrHistoricalRegion': dict(sorted(country_counts.items())),
        'deduplication': 'Same source brewery_id + NFKC/HTML-decoded/whitespace-collapsed/casefolded name. Lowest numeric source id is canonical; all sourceIds retained. Conflicting nonzero numbers/styles become unknown.',
        'duplicateGroups': merges,
        'scopeNote': '开放历史啤酒资料，包含未确认精酿身份的酒款；并非一万款精酿，不代表全产区、现役酒厂或每款真实生产地。无照片、无推断风味。',
    }
    assert len({row['id'] for row in beers}) == len(beers)
    assert len({row['id'] for row in breweries}) == len(breweries)
    assert sum(len(row['sourceIds']) for row in beers) == len(original_beers)
    assert all(row['breweryId'] in brewery_map for row in beers)
    assert all(row['image'] is None and row['flavors'] == [] for row in beers)
    payload = {'metadata': metadata, 'breweries': breweries, 'beers': beers}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    manifest = {'source': REPO, 'downloadedOrVerifiedAt': datetime.now(timezone.utc).isoformat(), 'files': manifest_files, 'licenses': {'database': ODBL, 'contents': DBCL}, 'note': 'Original bytes preserved. Source README mislinks the Open Database License anchor to DbCL; both named licenses and correct URLs are retained.'}
    (SOURCE_DIR / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (SOURCE_DIR / 'NOTICE.md').write_text('# Open Beer Database 来源与许可\n\n原始数据来自 ' + REPO + '，README.md 保留原始许可声明。数据库：ODbL 1.0 (' + ODBL + ')；单项内容：DbCL 1.0 (' + DBCL + ')。原 README 的 ODbL 超链接误指向 DbCL，本说明提供两份正确链接，不改变原文件。\n\n本项目的派生文件 /data/openbeer.json 保留上述许可与署名；处理脚本 scripts/import-openbeer.py 执行确定性名称归一、去重、中文风格显示标签、未知值清理和历史地点标注。CSV 内相对图片 filepath 不代表已取得图片，未使用这些图片。其他演示集合及软件有各自许可证。\n')
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    print('outputBytes:', OUTPUT.stat().st_size)

if __name__ == '__main__':
    main()
