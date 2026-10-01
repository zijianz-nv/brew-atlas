#!/usr/bin/env python3
"""Audit at most 1,000 local BeerTasting pilot records; performs no network I/O.

Usage: python3 scripts/beertasting-pilot-quality.py --input PATH [--output PATH]
Zero and False are present values. Source IDs, image links, and coordinates are
not assertions of unique real products, valid photos, craft status, or origin.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit, urlunsplit


BASE = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = BASE / 'research/beertasting-pilot-2026-09-18/quality.json'
MAX_BYTES = 25_000_000
MAX_RECORDS = 1000
UNKNOWN = '(not recorded)'

# Dot paths read only known product/brewery fields, never reviews or user data.
ALIASES = {
    'id': ('id', 'beer_id'),
    'name': ('name', 'display_name'),
    'url': ('url', 'beer_url'),
    'source_url': ('source_url',),
    'brewery_id': ('brewery_id', 'brewery.id'),
    'brewery_name': ('brewery_name', 'brewery.name', 'brewery'),
    'brewery_city': ('brewery_city', 'brewery.city'),
    'brewery_region': ('brewery_region', 'brewery.region'),
    'brewery_country_code': ('brewery_country_code', 'brewery.country'),
    'country_code': ('country_code', 'country.alpha_2'),
    'country_name': ('country_name', 'country.name', 'brewery.country_name'),
    'abv_percent': ('abv_percent',),
    'ibu_raw': ('ibu_raw', 'ibu'),
    'style_family': ('style_family', 'beer_type_family_name'),
    'style': ('style', 'beer_type_name'),
    'ean_raw': ('ean_raw', 'ean'),
    'image_url': ('image_url', 'banner_image_url'),
    'image_media_id': ('image_media_id', 'banner_image.uuid'),
    'image_declared_mime': ('image_declared_mime', 'banner_image.mime_type'),
    'rating': ('rating', 'avg_rating'),
    'ratings_count': ('ratings_count',),
    'is_retired': ('is_retired',),
    'is_draught': ('is_draught',),
    'fermentation': ('fermentation', 'fermentation_name'),
    'hops': ('hops',),
    'malts': ('malts',),
    'flavor_tags': ('flavor_tags',),
    'description': ('description',),
    'source_updated_at': ('source_updated_at', 'updated_at'),
    'secondary_brewery_name': ('secondary_brewery_name', 'second_brewery.name',
                               'secondary_brewery.name', 'second_brewery', 'secondary_brewery'),
    'latitude': ('latitude',),
    'longitude': ('longitude',),
}


def read_field(record, name):
    for path in ALIASES[name]:
        value = record
        for part in path.split('.'):
            if not isinstance(value, dict) or part not in value:
                break
            value = value[part]
        else:
            return True, value
    return False, None


def empty(value):
    return (value is None or isinstance(value, str) and not value.strip()
            or isinstance(value, (list, dict)) and len(value) == 0)


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def label(value):
    return value.strip() if isinstance(value, str) and value.strip() else UNKNOWN


def distribution(values):
    counts = Counter(values)
    return [{'value': key, 'records': count} for key, count in
            sorted(counts.items(), key=lambda item: (-item[1], item[0]))]


def duplicate_groups(values):
    counts = Counter(value for value in values if value is not None)
    repeated = {value: count for value, count in counts.items() if count > 1}
    return {
        'unique_nonempty_values': len(counts),
        'missing_records': sum(value is None for value in values),
        'duplicate_groups': len(repeated),
        'extra_rows_beyond_first': sum(count - 1 for count in repeated.values()),
        'examples': [{'value': key, 'records': count} for key, count in
                     sorted(repeated.items(), key=lambda item: (-item[1], item[0]))[:10]],
    }


def text_or_none(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def canonical_beer_url(value):
    url = text_or_none(value)
    if url is None:
        return None
    try:
        parsed = urlsplit(url)
        if (parsed.hostname in ('www.beertasting.com', 'beertasting.com')
                and re.fullmatch(r'/[a-z]{2}/beers/[^/]+/?', parsed.path)):
            return urlunsplit(('https', 'www.beertasting.com', parsed.path.rstrip('/'), '', ''))
    except ValueError:
        pass
    return url


def classify_image(value):
    url = text_or_none(value)
    if url is None:
        return 'missing', False
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ('https', 'http') or not parsed.hostname:
            return 'missing', True
    except ValueError:
        return 'missing', True
    path = parsed.path.lower()
    if '/static/' in path or re.search(r'(placeholder|fallback|default[_-]|no[_-]?image)', path):
        return 'placeholder', False
    return 'candidate', False


def boolean_counts(values):
    return {
        'true': sum(value is True for value in values),
        'false': sum(value is False for value in values),
        'missing': sum(empty(value) for value in values),
        'invalid_type': sum(not empty(value) and type(value) is not bool for value in values),
    }


def audit_document(document):
    if not isinstance(document, dict) or not isinstance(document.get('records'), list):
        raise ValueError('Input must be an object containing records: [...].')
    records = document['records']
    if len(records) > MAX_RECORDS or any(not isinstance(row, dict) for row in records):
        raise ValueError('Input must contain at most 1,000 object records.')
    count = len(records)
    fields = {name: [read_field(row, name) for row in records] for name in ALIASES}
    values = {name: [value for _, value in pairs] for name, pairs in fields.items()}
    completeness = {}
    for name, pairs in fields.items():
        present = sum(exists for exists, _ in pairs)
        nonempty = sum(not empty(value) for _, value in pairs)
        completeness[name] = {
            'key_present_records': present, 'key_absent_records': count - present,
            'explicit_null_records': sum(exists and value is None for exists, value in pairs),
            'empty_string_or_collection_records': sum(exists and value is not None and empty(value)
                                                       for exists, value in pairs),
            'nonempty_records': nonempty,
            'nonempty_percent': round(100 * nonempty / count, 2) if count else None,
        }
    ids = [text_or_none(value) for value in values['id']]
    urls = [text_or_none(value) for value in values['url']]
    normalized_urls = [canonical_beer_url(value) for value in values['url']]
    url_ids = defaultdict(set)
    for url, beer_id in zip(normalized_urls, ids):
        if url is not None and beer_id is not None:
            url_ids[url].add(beer_id)
    cross_ids = {url: sorted(beer_ids) for url, beer_ids in url_ids.items() if len(beer_ids) > 1}

    image_results = [classify_image(value) for value in values['image_url']]
    image_counts = Counter(status for status, _ in image_results)
    declared_aliases = {'candidate': 'candidate', 'candidate_product_image': 'candidate',
                        'placeholder': 'placeholder', 'generic_static_placeholder': 'placeholder',
                        'missing': 'missing'}
    image_mismatches = []
    for index, ((computed, _), row) in enumerate(zip(image_results, records)):
        declared = row.get('image_class')
        if declared in declared_aliases and declared_aliases[declared] != computed:
            image_mismatches.append({'row_index': index, 'id': ids[index],
                                     'declared': declared, 'computed': computed})
    abv = values['abv_percent']
    valid_abv = [value for value in abv if finite_number(value) and 0 <= value <= 100]
    invalid_abv = [index for index, value in enumerate(abv)
                   if not empty(value) and not (finite_number(value) and 0 <= value <= 100)]
    ibu = values['ibu_raw']
    countries = [label(value) for value in values['country_code']]
    brewer_countries = [label(value) for value in values['brewery_country_code']]
    regions = [f'{country} / {label(region)}' if label(region) != UNKNOWN else UNKNOWN
               for country, region in zip(brewer_countries, values['brewery_region'])]
    breweries = []
    for brewery_id, brewery_name in zip(values['brewery_id'], values['brewery_name']):
        name = label(brewery_name)
        breweries.append(f'{name} [{brewery_id}]' if text_or_none(brewery_id) else name)
    latitudes, longitudes = values['latitude'], values['longitude']
    pairs_present = sum(not empty(lat) and not empty(lon) for lat, lon in zip(latitudes, longitudes))
    pairs_valid = sum(finite_number(lat) and finite_number(lon) and -90 <= lat <= 90 and -180 <= lon <= 180
                      for lat, lon in zip(latitudes, longitudes))
    warnings = []
    for key in ('selected_count', 'record_count'):
        if key in document and document[key] != count:
            warnings.append(f'{key} differs from actual records length.')
    if invalid_abv:
        warnings.append('Some ABV values are invalid; they were not coerced or converted to zero.')
    if image_mismatches:
        warnings.append('Some declared image classes differ from independent URL heuristics.')
    return {
        'schema_version': 1,
        'record_count': count,
        'population': 'All input rows; distributions and field rates are not deduplicated or extrapolated globally.',
        'selection': document.get('selection'),
        'identity': {
            'ids': duplicate_groups(ids), 'exact_beer_urls': duplicate_groups(urls),
            'canonical_beer_urls': duplicate_groups(normalized_urls),
            'canonical_url_rule': 'For recognized BeerTasting beer URLs only: HTTPS, www host, no trailing slash/query/fragment; preserve locale and slug.',
            'canonical_urls_with_multiple_ids': len(cross_ids),
            'multiple_id_examples': [{'url': url, 'ids': beer_ids} for url, beer_ids in sorted(cross_ids.items())[:10]],
        },
        'field_completeness': completeness,
        'field_completeness_rule': 'None, blank strings and empty collections are empty. Numeric 0 and boolean False are present. Presence does not certify validity.',
        'distributions': {
            'country_code': distribution(countries),
            'country_name': distribution(label(value) for value in values['country_name']),
            'brewery_country_code': distribution(brewer_countries),
            'brewery_region_with_country': distribution(regions),
            'breweries': distribution(breweries),
            'style_family': distribution(label(value) for value in values['style_family']),
            'style': distribution(label(value) for value in values['style']),
        },
        'images': {
            **{status: image_counts[status] for status in ('candidate', 'placeholder', 'missing')},
            'candidate_percent': round(100 * image_counts['candidate'] / count, 2) if count else None,
            'unique_candidate_urls': len({url for url, (status, _) in zip(values['image_url'], image_results) if status == 'candidate'}),
            'malformed_url_records': sum(invalid for _, invalid in image_results),
            'classification_mismatch_count': len(image_mismatches),
            'classification_mismatch_examples': image_mismatches[:10],
            'rule': 'URL-only heuristic: /static/ or placeholder/fallback/default/no-image names are excluded. This includes the observed generic draught_beer.png.',
            'availability_verified': False, 'photo_identity_verified': False,
        },
        'abv_percent': {
            'valid_numeric': len(valid_abv), 'missing': sum(empty(value) for value in abv),
            'zero': sum(value == 0 for value in valid_abv),
            'at_most_0_5_including_zero': sum(value <= 0.5 for value in valid_abv),
            'positive_at_most_0_5': sum(0 < value <= 0.5 for value in valid_abv),
            'invalid': len(invalid_abv), 'invalid_row_indices': invalid_abv[:10],
            'minimum': min(valid_abv) if valid_abv else None,
            'maximum': max(valid_abv) if valid_abv else None,
            'rule': 'Input is already percent; never multiply it again. Finite numeric values 0..100 are structurally valid, not independently verified.',
        },
        'ibu': {
            'missing': sum(empty(value) for value in ibu),
            'zero_raw': sum(finite_number(value) and value == 0 for value in ibu),
            'positive_raw': sum(finite_number(value) and value > 0 for value in ibu),
            'invalid': sum(not empty(value) and not (finite_number(value) and value >= 0) for value in ibu),
            'zero_is_confirmed_zero_bitterness': False,
        },
        'is_retired': boolean_counts(values['is_retired']),
        'is_draught': boolean_counts(values['is_draught']),
        'collaborations': {
            'secondary_brewery_recorded': sum(not empty(value) for value in values['secondary_brewery_name']),
            'secondary_brewery_key_absent': completeness['secondary_brewery_name']['key_absent_records'],
            'secondary_breweries': distribution(label(value) for value in values['secondary_brewery_name']),
            'rule': 'Count only an explicit second-brewery field; do not infer collaborators from the beer name.',
        },
        'coordinates': {'pairs_present': pairs_present, 'pairs_in_numeric_range': pairs_valid,
                        'production_location_verified': False},
        'not_verified': {
            'craft_status': 'No independent craft qualification; raw style categories can include Radler and alcohol-free products.',
            'unique_real_product_count': 'Distinct source IDs can still represent duplicate products, variants or historical entries.',
            'production_coordinates': 'Brewery address, country and numeric coordinates do not establish each beer actual production location.',
            'global_representativeness': 'Purposively selected brewery lists are not a random global sample.',
            'image_rights_and_identity': 'A candidate URL is not a licensed, current, matching bottle/can photo.',
            'sensory_intensity': 'Style family colors and community taste/smell scores are not measured flavor intensities.',
        },
        'warnings': warnings,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error('Output must not replace the input file.')
    try:
        with args.input.open('rb') as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('Input exceeds the 25 MB audit cap.')
        def reject_constant(value):
            raise ValueError('Non-standard JSON numeric constant: ' + value)
        result = audit_document(json.loads(raw, parse_constant=reject_constant))
    except (OSError, ValueError) as error:
        parser.error(str(error))
    result['audited_at_utc'] = datetime.now(timezone.utc).isoformat()
    result['input'] = {'path': str(args.input.resolve()), 'bytes': len(raw),
                       'sha256': hashlib.sha256(raw).hexdigest()}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=args.output.parent,
                                     prefix='.quality-', suffix='.tmp', delete=False) as stream:
        temp_path = Path(stream.name)
        json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    temp_path.replace(args.output)
    print(json.dumps({'output': str(args.output.resolve()), 'records': result['record_count'],
                      'unique_ids': result['identity']['ids']['unique_nonempty_values'],
                      'images': {key: result['images'][key] for key in ('candidate', 'placeholder', 'missing')}},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
