#!/usr/bin/env python3
"""Read-only OFF identity/brand-reference matcher. No network or source-data writes.

Usage: python3 scripts/off-matching.py .runtime/off/page-*.json
The report groups packaging records, but does not assert verified craft status,
current production, legal photo reuse, or exact recipe equivalence.
Import this file and call match_catalog(products, root=PROJECT_ROOT) from an importer.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import html
import json
import math
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]

# Explicit brand aliases whose association is already stated in the existing
# source-backed world/archive records. Keep the full URLs in each match result.
# These are brand-reference locations, never statements of where an OFF item
# was manufactured; no historical brewery aliases are guessed from beer names.
SOURCE_ALIASES = {
    'sierra-nevada': ['Sierra Nevada'],
    'duvel-moortgat': ['Duvel', 'Duvel Moortgat'],
    'chimay': ['Chimay'],
    'weihenstephan': ['Weihenstephan', 'Weihenstephaner'],
    'guinness': ['Guinness'],
    'pilsner-urquell': ['Pilsner Urquell'],
    'lindemans': ['Lindemans'],
    'kiuchi': ['Kiuchi', 'Hitachino Nest'],
    'coopers': ['Coopers'],
    'stone': ['Stone Brewing'],
    'unibroue': ['Unibroue'],
    'la-trappe': ['La Trappe'],
    'brouwerij-ij': ["Brouwerij 't IJ", "'t IJ"],
    'nogne-o': ['Nøgne Ø'],
    'mikkeller': ['Mikkeller'],
    'colorado': ['Cervejaria Colorado'],
    'omnipollo': ['Omnipollo'],
    'orval-brewery': ['Orval'],
    'chouffe-brewery': ['La Chouffe', 'Chouffe'],
    'rodenbach': ['Rodenbach'],
    'dupont': ['Brasserie Dupont'],
    'st-bernardus': ['St. Bernardus', 'St Bernardus', 'St.Bernardus'],
    'brewdog-ellon': ['BrewDog'],
}

GENERIC_NAMES = {
    '', 'beer', 'beers', 'biere', 'bière', 'bier', 'birra', 'cerveza',
    'biere blonde', 'bière blonde', 'blonde', 'biere brune', 'bière brune',
    'biere blanche', 'bière blanche', 'beer blonde', 'ale', 'lager',
    'premium beer', 'premium lager', '啤酒',
}


def normalize(value):
    """Whole-name normalization only: accents/numbers are not approximated."""
    value = unicodedata.normalize('NFKC', html.unescape(str(value or ''))).casefold()
    value = value.replace('&', ' and ')
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in value).split())


def brewery_key(value):
    """Remove explicit organization words at the edges, not place names."""
    key = normalize(value)
    prefix = r'^(?:brewery|brasserie|brasseries|brouwerij|cervejaria|birrificio)\s+'
    suffix = r'\s+(?:brewing company|brewing co|brewing|brewery|breweries|company|co|limited|ltd|inc|llc|plc)$'
    for _ in range(3):
        changed = re.sub(suffix, '', re.sub(prefix, '', key)).strip()
        if changed == key:
            break
        key = changed
    return key if len(key) >= 3 and key not in GENERIC_NAMES else ''


def has_location(brewery):
    lat, lng = brewery.get('lat'), brewery.get('lng')
    return (isinstance(lat, (int, float)) and not isinstance(lat, bool)
            and isinstance(lng, (int, float)) and not isinstance(lng, bool)
            and math.isfinite(lat) and math.isfinite(lng)
            and abs(lat) <= 90 and abs(lng) <= 180 and (lat, lng) != (0, 0))


def brand_values(product):
    # The human-maintained brands field takes precedence over machine tags.
    # Tags are a fallback only; language prefixes are not country evidence.
    if isinstance(product.get('brands'), str) and product['brands'].strip():
        values = re.split(r'[,;]', product['brands'])
        source = 'brands'
    else:
        tags = product.get('brands_tags') or []
        if not isinstance(tags, list):
            tags = []
        values = [re.sub(r'^[a-z]{2}:', '', str(v)) for v in tags]
        source = 'brands_tags'
    unique = {normalize(v): v.strip() for v in values if normalize(v)}
    return list(unique.values()), source


def product_name(product):
    language = str(product.get('lc') or product.get('lang') or '')
    keys = ['product_name', f'product_name_{language}', 'product_name_en', 'product_name_fr']
    keys += sorted(k for k in product if k.startswith('product_name_'))
    for key in dict.fromkeys(keys):
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip(), key
    return '', None


def identity_name(value):
    """Strip explicit pack/volume words only; retain ABV, recipe years and numbers."""
    value = unicodedata.normalize('NFKC', html.unescape(str(value or ''))).casefold()
    # 6 x 330 ml, 330ml, 75 cl; sizes are package attributes, not new recipes.
    value = re.sub(r'(?<![\w.])(?:\d+\s*[x×*]\s*)?\d+(?:[.,]\d+)?\s*(?:ml|cl|dl|litres?|liters?|l|fl\.?\s*oz)\b', ' ', value)
    value = re.sub(r'\b(?:pack\s+(?:of\s+)?\d+|\d+\s*[- ]?pack|lot\s+de\s+\d+)\b', ' ', value)
    value = re.sub(r'\b(?:\d+\s*(?:[x×*]\s*)?)(?:bottles?|cans?|bouteilles?|canettes?)\b', ' ', value)
    value = re.sub(r'\b(?:bottles?|cans?|bouteilles?|canettes?)\s*[).,\- ]*$', ' ', value)
    return normalize(value)


def supplied_abv(product):
    nutrients = product.get('nutriments') or {}
    if isinstance(nutrients, list):
        nutrients = {item.get('name'): item.get('value') for item in nutrients if isinstance(item, dict) and item.get('name')}
    if not isinstance(nutrients, dict):
        nutrients = {}
    value = nutrients.get('alcohol_100g', nutrients.get('alcohol_value'))
    try:
        value = float(str(value).replace(',', '.'))
    except (TypeError, ValueError):
        return None
    return round(value, 4) if math.isfinite(value) and 0 <= value <= 100 else None


class BreweryIndex:
    def __init__(self, root=ROOT):
        self.breweries = {}
        self.beers = []
        self.full = defaultdict(set)
        self.reduced = defaultdict(set)
        self.aliases = defaultdict(set)
        for collection in ['world', 'archive', 'openbeer']:
            data = json.loads((Path(root) / 'public' / 'data' / f'{collection}.json').read_text())
            self.beers.extend(data['beers'])
            for brewery in data['breweries']:
                item = dict(brewery, sourceCollection=collection)
                self.breweries[item['id']] = item
                self.full[normalize(item['name'])].add(item['id'])
                if brewery_key(item['name']):
                    self.reduced[brewery_key(item['name'])].add(item['id'])
        for brewery_id, aliases in SOURCE_ALIASES.items():
            if brewery_id not in self.breweries:
                continue
            for alias in aliases:
                self.aliases[normalize(alias)].add(brewery_id)

    def match_one(self, brand):
        key = normalize(brand)
        reduced_key = brewery_key(brand)
        # A full company suffix can still name an explicitly reviewed brand
        # reference. This resolves current/historical duplicate records without
        # choosing an arbitrary historical site of a chain.
        source_aliases = self.aliases.get(key, set())
        if not source_aliases and reduced_key != key:
            source_aliases = self.aliases.get(reduced_key, set())
        if source_aliases:
            return source_aliases, 'existing_source_explicit_brand_alias'
        for index, lookup, method in [
            (self.full, key, 'exact_normalized_brewery_name'),
            (self.reduced, reduced_key, 'exact_brewery_name_without_organization_words'),
        ]:
            candidates = index.get(lookup, set()) if lookup else set()
            if candidates:
                return candidates, method
        return set(), 'unmatched_brand'

    def match(self, product):
        brands, field = brand_values(product)
        evidence = []
        possible = set()
        ambiguous = False
        for brand in brands:
            ids, method = self.match_one(brand)
            possible.update(ids)
            ambiguous = ambiguous or len(ids) > 1
            evidence.append({'brand': brand, 'sourceField': field, 'method': method, 'candidateBreweryIds': sorted(ids)})
        result = {'status': 'unmatched', 'breweryId': None, 'locationRole': None,
                  'locationPrecision': None, 'lat': None, 'lng': None, 'evidence': evidence}
        if ambiguous or len(possible) > 1:
            result['status'] = 'ambiguous_brand_reference'
            return result
        if not possible:
            return result
        brewery = self.breweries[next(iter(possible))]
        historical = brewery['sourceCollection'] == 'openbeer'
        result.update({
            'status': 'matched_brand_reference', 'breweryId': brewery['id'],
            'breweryName': brewery['name'],
            'locationRole': 'historical_brand_reference' if historical else 'brand_reference',
            'locationPrecision': brewery.get('locationPrecision'),
            'locationSourceUrls': brewery.get('sourceUrls', []),
            'locationSourceCollection': brewery['sourceCollection'],
            'country': brewery.get('country'), 'countryZh': brewery.get('countryZh'),
            'city': brewery.get('city'),
            'geographyNote': ('品牌对应的历史酒厂参考位置，未核验现址或商品实际生产地。' if historical
                              else '品牌参考位置，不代表该商品实际生产地；国家来自参考酒厂资料。'),
        })
        result['locationEvidence'] = {
            'kind': 'existing_brewery_brand_reference',
            'sourceBreweryId': brewery['id'], 'sourceCollection': brewery['sourceCollection'],
            'sourceLocationPrecision': brewery.get('locationPrecision'),
            'brandMatch': evidence, 'sourceUrls': brewery.get('sourceUrls', []),
            'productionLocationVerified': False,
            'salesCountriesUsed': False, 'ingredientOriginsUsed': False,
        }
        if has_location(brewery):
            result.update(lat=brewery['lat'], lng=brewery['lng'])
        return result

    def statistics(self):
        return {
            'breweryRecords': len(self.breweries),
            'uniqueNormalizedFullNames': len(self.full),
            'unambiguousFullNames': sum(len(ids) == 1 for ids in self.full.values()),
            'ambiguousFullNames': sum(len(ids) > 1 for ids in self.full.values()),
            'uniqueOrganizationReducedNames': len(self.reduced),
            'unambiguousOrganizationReducedNames': sum(len(ids) == 1 for ids in self.reduced.values()),
            'sourceBackedExplicitBrandAliases': len(self.aliases),
            'explicitAliasReferenceBreweries': len(set().union(*self.aliases.values())),
        }


def match_catalog(products, root=ROOT):
    index = BreweryIndex(root)
    by_code = {}
    invalid = 0
    for product in products:
        if not isinstance(product, dict):
            invalid += 1
            continue
        code = str(product.get('code') or product.get('_id') or '').strip()
        if not code:
            invalid += 1
            continue
        if code not in by_code or len(json.dumps(product)) > len(json.dumps(by_code[code])):
            by_code[code] = product
    grouped = defaultdict(list)
    unresolved = []
    for code, product in sorted(by_code.items()):
        name, name_field = product_name(product)
        brands, brands_field = brand_values(product)
        identity = identity_name(name)
        reference = index.match(product)
        # Resolving a brand to one reference also joins harmless legal-suffix
        # variants of that same brand. Unmatched labels stay distinct.
        brand_identity = reference['breweryId'] or '|'.join(sorted(normalize(b) for b in brands))
        if not identity or not brands or identity in GENERIC_NAMES:
            unresolved.append({'code': code, 'name': name, 'brands': brands,
                               'reason': 'missing_brand_or_nonspecific_product_name', 'reference': reference})
            continue
        # A brand alone does not identify a recipe/product. Apply this to every
        # brand, including familiar names that also market a flagship beer.
        # The real OFF Brewdog-only record depicts Hazy Jane on its carton;
        # grouping it as "Brewdog" could collapse unrelated brand products.
        if identity in {normalize(brand) for brand in brands}:
            unresolved.append({'code': code, 'name': name, 'brands': brands,
                               'identityStatus': 'unresolved_identity',
                               'reason': 'product_name_is_only_brand', 'reference': reference})
            continue
        # Strip a product's own exact brand prefix only, for "BrewDog Punk IPA"
        # versus "Punk IPA". Never remove matching words in the middle.
        for brand in sorted(brands, key=len, reverse=True):
            prefix = normalize(brand)
            if identity.startswith(prefix + ' '):
                stripped = identity[len(prefix):].strip()
                if stripped and stripped not in GENERIC_NAMES:
                    identity = stripped
                    break
        # Remaining numeric ABV/year text distinguishes explicit variants.
        key = json.dumps([brand_identity, identity], ensure_ascii=False)
        grouped[key].append({'code': code, 'name': name, 'nameSourceField': name_field,
                             'brands': brands, 'brandsSourceField': brands_field,
                             'quantity': product.get('quantity'), 'abv': supplied_abv(product),
                             'hasFrontImage': bool(product.get('image_front_url') or product.get('image_front_small_url')
                                                   or (product.get('selected_images') or {}).get('front')),
                             'reference': reference})
    groups = []
    for key, rows in sorted(grouped.items()):
        variants = {r['abv'] for r in rows if r['abv'] is not None}
        conflict = len(variants) > 1
        _, name_identity = json.loads(key)
        groups.append({
            'id': 'off-group-' + hashlib.sha256(key.encode()).hexdigest()[:16],
            'identityKey': json.loads(key), 'normalizedProductName': name_identity,
            'name': rows[0]['name'], 'barcodes': [r['code'] for r in rows],
            'packageRecordCount': len(rows),
            'identityStatus': 'needs_review_conflicting_abv' if conflict else 'exact_brand_and_packaging_normalized_name',
            'mergeEligible': not conflict,
            'identityNote': '同品牌与规范商品名的包装记录归组；不是跨年份配方等同性认证，未做模糊酒名匹配。',
            'abvValues': sorted(variants), 'hasFrontImage': any(r['hasFrontImage'] for r in rows),
            'reference': rows[0]['reference'], 'products': rows,
        })
    eligible = [g for g in groups if g['mergeEligible']]
    located = [g for g in eligible if g['reference'].get('lat') is not None]
    counts = Counter(g['reference']['status'] for g in groups)
    unmatched = Counter(brand for g in groups if g['reference']['status'] != 'matched_brand_reference'
                        for brand in g['products'][0]['brands'])
    return {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'rulesVersion': 2,
        'scopeNote': '只读商品身份及品牌参考匹配；不使用销售地区、原料来源推定产地，不验证精酿身份、不验证图片许可。',
        'index': index.statistics(),
        'counts': {
            'inputProductRows': len(products), 'distinctBarcodes': len(by_code),
            'invalidRows': invalid, 'identityGroups': len(groups),
            'unresolvedIdentityBarcodes': len(unresolved), 'mergeEligibleGroups': len(eligible),
            'brandOnlyIdentityBarcodes': sum(r['reason'] == 'product_name_is_only_brand' for r in unresolved),
            'packagingRowsGrouped': sum(g['packageRecordCount'] - 1 for g in eligible),
            'groupsWithFrontImage': sum(g['hasFrontImage'] for g in eligible),
            'groupsWithBrandReferenceLocation': len(located),
            'groupsWithFrontImageAndBrandReferenceLocation': sum(g['hasFrontImage'] for g in located),
            'historicalReferenceLocationGroups': sum(g['reference']['locationRole'] == 'historical_brand_reference' for g in located),
            **counts,
        },
        'unmatchedBrandGroupCounts': dict(unmatched.most_common()),
        'groups': groups, 'unresolvedIdentityRecords': unresolved,
    }


def self_test():
    index = BreweryIndex()
    assert normalize('BrewDog') == normalize('BREWDOG')
    assert brewery_key('Sierra Nevada Brewing Co.') == brewery_key('Sierra Nevada')
    assert brewery_key('Sierra Leone Brewery') != brewery_key('Sierra Nevada')
    assert identity_name('Punk IPA 6 x 330ml') == identity_name('Punk IPA 500 ml')
    assert identity_name('Punk IPA 2010') != identity_name('Punk IPA 2020')
    assert identity_name('1664') == '1664'
    assert identity_name('Bottle Rocket') != identity_name('Rocket')
    assert index.match({'brands': 'BrewDog', 'countries_tags': ['en:japan']})['country'] == 'United Kingdom'
    assert index.match({'brands': 'Sierra Nevada Brewing Co.'})['breweryId'] == 'sierra-nevada'
    assert index.match({'brands': 'Unknown Example', 'countries_tags': ['en:united-kingdom'], 'origins': 'Scotland'})['lat'] is None
    assert index.match({'brands': 'BrewDog,Chimay'})['status'] == 'ambiguous_brand_reference'
    assert index.match({'brands': None, 'brands_tags': None})['status'] == 'unmatched'
    assert supplied_abv({'nutriments': None}) is None
    sample = [
        {'code': '1', 'brands': 'BrewDog', 'product_name': 'Punk IPA 6 x 330 ml'},
        {'code': '2', 'brands': 'BrewDog', 'product_name': 'Punk IPA 500ml'},
        {'code': '3', 'brands': 'BrewDog', 'product_name': 'Punk IPA 2010'},
        {'code': '4', 'brands': 'BrewDog', 'product_name': 'Beer'},
        {'code': '5056025434516', 'brands': 'Brewdog', 'product_name': 'Brewdog'},
        {'code': '6', 'brands': 'Heineken', 'product_name': 'HEINEKEN 6 x 330ml'},
        {'code': '7', 'brands': 'Store Brand, BrewDog', 'product_name': 'BrewDog'},
    ]
    report = match_catalog(sample)
    assert report['counts']['identityGroups'] == 2
    assert report['counts']['packagingRowsGrouped'] == 1
    assert report['counts']['unresolvedIdentityBarcodes'] == 4
    assert report['counts']['brandOnlyIdentityBarcodes'] == 3
    brand_only = {r['code'] for r in report['unresolvedIdentityRecords'] if r['reason'] == 'product_name_is_only_brand'}
    assert brand_only == {'5056025434516', '6', '7'}
    assert all(g['reference']['locationRole'] == 'brand_reference' for g in report['groups'])
    print('OFF matching self-test passed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', nargs='*', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / '.runtime/off/matching-report.json')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    products = []
    for file in args.inputs:
        data = json.loads(file.read_text())
        if isinstance(data, list):
            products.extend(data)
        elif isinstance(data, dict) and isinstance(data.get('products'), list):
            products.extend(data['products'])
        elif isinstance(data, dict) and isinstance(data.get('product'), dict):
            products.append(data['product'])
    report = match_catalog(products)
    report['inputFiles'] = [str(p) for p in args.inputs]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    index = BreweryIndex()
    aliases = [{'breweryId': brewery_id, 'aliases': aliases,
                'sourceUrls': index.breweries[brewery_id].get('sourceUrls', []),
                'role': 'brand_reference', 'productionLocationVerified': False}
               for brewery_id, aliases in SOURCE_ALIASES.items() if brewery_id in index.breweries]
    (args.output.parent / 'brand-reference-aliases.json').write_text(json.dumps({
        'source': 'Existing source-backed world/archive brewery records',
        'note': 'Explicit brand aliases; all locations are references, not product manufacturing evidence.',
        'aliases': aliases,
    }, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'index': report['index'], 'counts': report['counts'], 'output': str(args.output)}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
