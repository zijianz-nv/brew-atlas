#!/usr/bin/env python3
"""Stage real Open Food Facts beer/photo candidates, without signup or API keys.

The official Search-a-licious endpoint is verified anonymous and is the default.
The live v2 API and official OFF Hugging Face viewer are optional alternatives.
Only .runtime/off is written. No beer identity, craft status, or origin is inferred.
"""
import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.runtime/off'
USER_AGENT = 'BrewAtlasLocalDemo/1.0 (local non-commercial prototype)'
DATASET = 'openfoodfacts/product-database'
HF_WHERE = '"categories" LIKE \'%beer%\''
FIELDS = 'code,product_name,brands,brands_tags,categories_tags,alcohol_value,nutriments,image_front_url,image_front_small_url,selected_images,countries_tags,manufacturing_places,origins,emb_codes,link,ingredients_text,quantity,last_modified_t,images'
LICENSE = {
    'database': 'https://opendatacommons.org/licenses/odbl/1-0/',
    'contents': 'https://opendatacommons.org/licenses/dbcl/1-0/',
    'photos': 'https://creativecommons.org/licenses/by-sa/3.0/',
    'officialExplanation': 'https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/',
}

def now():
    return datetime.now(timezone.utc).isoformat()

def write_json(filename, data):
    target = OUT / filename
    temporary = target.with_suffix(target.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(target)

def request_json(url, filename, timeout=45):
    target = OUT / filename
    metadata_path = OUT / (filename + '.source.json')
    if target.exists() and metadata_path.exists():
        metadata = json.loads(metadata_path.read_text())
        if metadata.get('url') == url:
            raw = target.read_bytes()
            if hashlib.sha256(raw).hexdigest() == metadata.get('sha256'):
                return json.loads(raw), metadata
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read(12_000_001)
        if len(raw) > 12_000_000:
            raise ValueError('Response exceeded 12 MB limit')
        data = json.loads(raw)
        metadata = {'url': url, 'httpStatus': response.status, 'fetchedAt': now(), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'partial': data.get('partial') if isinstance(data, dict) else None, 'responseHeaders': {key: value for key, value in response.headers.items() if key.lower() in ['x-revision', 'x-num-bytes', 'x-error-code', 'x-partial', 'hfpartial']}}
    target.write_bytes(raw)
    write_json(filename + '.source.json', metadata)
    return data, metadata

def lang_text(value, lang='en'):
    if isinstance(value, str):
        return value
    if not isinstance(value, list):
        return ''
    by_lang = {row.get('lang'): row.get('text') for row in value if isinstance(row, dict) and row.get('text')}
    return by_lang.get('main') or by_lang.get(lang) or by_lang.get('en') or next(iter(by_lang.values()), '')

def product_path(code):
    if not isinstance(code, str) or not re.fullmatch(r'\d{4,24}', code):
        return None
    # OFF API actually returns EAN-8 image URLs in one directory, e.g. /40173832/.
    # Its image-download documentation's Python snippet agrees with the live data.
    if len(code) <= 8:
        return code
    if len(code) == 9:
        return None
    return '/'.join([code[:3], code[3:6], code[6:9], code[9:]])

def convert_product(source, source_meta):
    if not isinstance(source, dict):
        return None
    tags = source.get('categories_tags') or []
    if 'en:beers' not in tags or any(tag in tags for tag in ['en:root-beers', 'en:root-beer-barrels-candies', 'en:candies']):
        return None
    code = str(source.get('code') or '')
    folder = product_path(code)
    if not folder:
        return None
    # AWS normalizes short codes to 13 digits; the legacy OFF image host does not.
    # Both URL forms were verified for EAN-8 40173832 against their respective hosts.
    aws_code = code.zfill(13)
    aws_folder = '/'.join([aws_code[:3], aws_code[3:6], aws_code[6:9], aws_code[9:]])
    lang = source.get('lang') or 'en'
    images = source.get('images') or {}
    if isinstance(images, list):
        images = {item['key']: {k: v for k, v in item.items() if k != 'key'} for item in images if isinstance(item, dict) and isinstance(item.get('key'), str)}
    if not isinstance(images, dict):
        return None
    keys = sorted([key for key in images if re.fullmatch(r'front_[a-z]{2,3}', key)], key=lambda key: (key != 'front_' + lang, key != 'front_en', key))
    selected = None
    for key in keys:
        item = images[key]
        if not isinstance(item, dict):
            continue
        imgid, rev = str(item.get('imgid') or ''), str(item.get('rev') or '')
        raw_image = images.get(imgid)
        sizes = item.get('sizes') or {}
        if imgid.isdigit() and rev.isdigit() and int(imgid) > 0 and int(rev) > 0 and isinstance(raw_image, dict) and sizes.get('400'):
            selected = {'key': key, 'imgid': imgid, 'rev': rev, 'uploader': raw_image.get('uploader') or 'Open Food Facts contributors', 'uploaded_t': raw_image.get('uploaded_t'), 'sizes': sizes}
            break
    if not selected:
        return None
    name = lang_text(source.get('product_name'), lang).strip()
    if not name:
        return None
    nutrients = source.get('nutriments') or {}
    if isinstance(nutrients, list):
        flattened = {}
        for nutrient in nutrients:
            if not isinstance(nutrient, dict) or not nutrient.get('name'):
                continue
            key = nutrient['name']
            for suffix, field in [('', 'value'), ('_value', 'value'), ('_100g', '100g'), ('_unit', 'unit')]:
                if nutrient.get(field) is not None:
                    flattened[key + suffix] = nutrient[field]
        nutrients = flattened
    result = {key: source.get(key) for key in ['code', 'brands', 'brands_tags', 'categories_tags', 'countries_tags', 'manufacturing_places', 'origins', 'emb_codes', 'link', 'quantity', 'last_modified_t', 'last_indexed_datetime', 'alcohol_value']}
    if isinstance(result['brands'], list):
        result['brands'] = ', '.join(value for value in result['brands'] if isinstance(value, str))
    result.update({
        'code': code, 'product_name': name, 'ingredients_text': lang_text(source.get('ingredients_text'), lang),
        'product_name_translations': source.get('product_name'), 'lang': lang,
        'nutriments': nutrients, 'images': images,
        'image_front_url': f'https://images.openfoodfacts.org/images/products/{folder}/{selected["key"]}.{selected["rev"]}.400.jpg',
        'image_front_small_url': f'https://images.openfoodfacts.org/images/products/{folder}/{selected["key"]}.{selected["rev"]}.200.jpg',
        'selected_images': source.get('selected_images'),
        '_offFront': {**selected,
            'awsRawUrl': f'https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/{aws_folder}/{selected["imgid"]}.400.jpg',
            'awsSelectedUrl': f'https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/{aws_folder}/{selected["key"]}.{selected["rev"]}.400.jpg'},
        '_source': source_meta,
    })
    return result

def summary(products, scanned, total, source, snapshot):
    dates = [int(p['last_modified_t']) for p in products if isinstance(p.get('last_modified_t'), (int, float))]
    return {
        'source': source, 'snapshot': snapshot, 'queriedRowsTotal': total, 'scannedRows': scanned,
        'selectedFrontCandidates': len(products), 'uniqueBarcodes': len({p['code'] for p in products}),
        'recordsWithBrands': sum(bool(p.get('brands')) for p in products),
        'recordsWithAlcohol': sum(p.get('nutriments', {}).get('alcohol') is not None or p.get('nutriments', {}).get('alcohol_100g') is not None for p in products),
        'firstProductModified': datetime.fromtimestamp(min(dates), timezone.utc).isoformat() if dates else None,
        'lastProductModified': datetime.fromtimestamp(max(dates), timezone.utc).isoformat() if dates else None,
        'license': LICENSE,
        'note': 'Candidates are packaging/barcode records, not deduplicated craft beers. Exact en:beers membership verified locally; root beer/candy excluded. Selected front metadata is present, but each image still needs a successful download and visual QA. countries_tags describes markets, not production origin.',
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', choices=['hf', 'api', 'search'], default='search')
    parser.add_argument('--target', type=int, default=1500)
    parser.add_argument('--max-pages', type=int, default=30)
    parser.add_argument('--page-size', type=int, default=20, help='20 is verified against the public HF viewer; larger payloads can fail.')
    parser.add_argument('--interval', type=float, default=7.0)
    args = parser.parse_args()
    if not 1 <= args.target <= 2000 or not 1 <= args.max_pages <= 200 or args.interval < 7 or not 1 <= args.page_size <= 100:
        parser.error('target 1–2000, max-pages 1–200, page-size 1–100 and interval >=7s required')
    OUT.mkdir(parents=True, exist_ok=True)
    snapshot = {}
    if args.source == 'hf':
        try:
            info, _ = request_json('https://huggingface.co/api/datasets/' + DATASET, 'hf-dataset-metadata.json')
            snapshot = {key: info.get(key) for key in ['id', 'sha', 'lastModified']}
        except Exception as error:
            snapshot = {'metadataError': str(error), 'dateStatus': 'unknown'}
    products = {}
    existing = OUT / 'products.json'
    if existing.exists():
        for product in json.loads(existing.read_text()).get('products', []):
            if isinstance(product, dict) and product.get('code') and 'en:beers' in (product.get('categories_tags') or []) and product.get('_offFront'):
                products[product['code']] = product
    if len(products) >= args.target:
        print(json.dumps({'status': 'reused_existing_candidates', 'candidates': len(products), 'target': args.target, 'message': 'Target already met; existing raw provenance and reports retained.'}), flush=True)
        return
    scanned = 0
    total = None
    source_pages = []
    for index in range(args.max_pages):
        if index > 0:
            time.sleep(args.interval)
        if args.source == 'hf':
            parameters = {'dataset': DATASET, 'config': 'default', 'split': 'food', 'where': HF_WHERE}
            if index:
                parameters['offset'] = index * args.page_size
            parameters['length'] = args.page_size
            url = 'https://datasets-server.huggingface.co/filter?' + urllib.parse.urlencode(parameters)
            filename = f'hf-{args.page_size}-page-{index:04d}.json'
        elif args.source == 'api':
            parameters = {'categories_tags_en': 'beers', 'page_size': args.page_size, 'page': index + 1, 'fields': FIELDS}
            url = 'https://world.openfoodfacts.org/api/v2/search?' + urllib.parse.urlencode(parameters)
            filename = f'api-page-{index + 1:04d}.json'
        else:
            parameters = {'q': 'categories_tags:"en:beers"', 'page_size': args.page_size, 'page': index + 1}
            url = 'https://search.openfoodfacts.org/search?' + urllib.parse.urlencode(parameters)
            filename = f'search-{args.page_size}-page-{index + 1:04d}.json'
        try:
            page, provenance = request_json(url, filename)
        except Exception as error:
            write_json('fetch-error.json', {'url': url, 'error': str(error), 'at': now(), 'stoppedPage': index, 'source': args.source})
            print(json.dumps({'status': 'stopped', 'error': str(error), 'page': index}, ensure_ascii=False), flush=True)
            break
        provenance['partial'] = page.get('partial')
        source_pages.append(provenance)
        if args.source == 'hf':
            entries = page.get('rows', [])
            total = page.get('num_rows_total')
        elif args.source == 'api':
            entries = [{'row': row} for row in page.get('products', [])]
            total = page.get('count')
        else:
            entries = [{'row': row} for row in page.get('hits', [])]
            total = page.get('count')
            provenance['isCountExact'] = page.get('is_count_exact')
            provenance['timedOut'] = page.get('timed_out')
        accepted = 0
        for entry in entries:
            scanned += 1
            # Dataset Viewer can truncate unusually large cells. Never treat those as complete source data.
            if entry.get('truncated_cells'):
                continue
            product = convert_product(entry.get('row'), {'provider': 'Open Food Facts', 'transport': args.source, 'dataset': DATASET if args.source == 'hf' else None, 'rawFile': filename, 'rowIndex': entry.get('row_idx'), 'snapshot': snapshot, **provenance})
            if product and product['code'] not in products:
                products[product['code']] = product
                accepted += 1
            if len(products) >= args.target:
                break
        stats = summary(list(products.values()), scanned, total, args.source, snapshot)
        stats['isCountExact'] = page.get('is_count_exact') if args.source == 'search' else None
        stats['partial'] = page.get('partial')
        write_json('products.json', {'source': {'provider': 'Open Food Facts', 'transport': args.source, 'dataset': DATASET if args.source == 'hf' else None, 'snapshot': snapshot, 'fetchedAt': now(), 'license': LICENSE}, 'stats': stats, 'products': list(products.values())})
        write_json('fetch-report.json', {**stats, 'pages': source_pages})
        print(json.dumps({'page': index, 'rows': len(entries), 'acceptedThisPage': accepted, 'candidates': len(products), 'queriedRowsTotal': total}, ensure_ascii=False), flush=True)
        if not entries or len(entries) < args.page_size or len(products) >= args.target:
            break
    print(json.dumps(summary(list(products.values()), scanned, total, args.source, snapshot), ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
