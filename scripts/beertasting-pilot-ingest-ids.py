"""Join real IDS CSV exports to the exact public-page payload saved alongside them."""
import argparse
import csv
import hashlib
import importlib.util
import json
import urllib.parse
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'research/beertasting-pilot-2026-09-18'
spec = importlib.util.spec_from_file_location('pilot', Path(__file__).with_name('beertasting-pilot.py'))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


def canonical(url, source):
    if not isinstance(url, str):
        return None
    p = urllib.parse.urlsplit(urllib.parse.urljoin(source, url.strip()))
    if p.hostname not in ('beertasting.com', 'www.beertasting.com') or '/en/beers/' not in p.path:
        return None
    return 'https://www.beertasting.com' + urllib.parse.unquote(p.path).rstrip('/')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', action='append', help='May be repeated for independent IDS workers')
    parser.add_argument('--target', type=int, default=1000)
    args = parser.parse_args()
    if not 1 <= args.target <= 1000:
        parser.error('Pilot target must be between 1 and 1000')
    manifest_paths = [Path(p) for p in args.manifest] if args.manifest else [BASE / '.runtime/ids-pilot/manifest.jsonl']
    secondary = BASE / '.runtime/ids-pilot-secondary/manifest.jsonl'
    if not args.manifest and secondary.exists():
        manifest_paths.append(secondary)
    entries = [json.loads(line) for path in manifest_paths for line in path.read_text().splitlines() if line.strip()]
    entries.sort(key=lambda e: (e['exported_at_utc'], e['url']))
    seeds = json.loads((BASE / 'research/beertasting-pilot-seeds-2026-09-18.json').read_text())['seeds']
    seed_lookup = {s['slug']: s for s in seeds}
    seed_lookup['bierol'] = {'continent': 'Europe'}
    records = {}
    pages = []
    raw_rows = []
    breweries = {}
    warnings = []
    seen_manifest = set()
    for entry in entries:
        key = (entry['url'], entry['csv_path'])
        if key in seen_manifest:
            continue
        seen_manifest.add(key)
        html = Path(entry['html_path']).read_text()
        supplement_source = 'same_browser_snapshot'
        snapshot_error = None
        try:
            page = pilot.parse_page(html, entry['url'])
        except (ValueError, KeyError) as exc:
            snapshot_error = str(exc)
            key_hash = hashlib.sha256(entry['url'].encode()).hexdigest()[:24]
            candidates = [OUT / 'public-page-run/pages' / (key_hash + '.json'), OUT / 'pages' / (key_hash + '.json')]
            available = [p for p in candidates if p.exists()]
            if not available:
                raise
            page = json.loads(available[0].read_text())
            if page['url'] != entry['url']:
                raise ValueError('Independent public-page cache URL mismatch')
            supplement_source = str(available[0])
        if page['meta']['current_page'] != entry['page']:
            raise ValueError('Saved HTML does not match current page: ' + entry['url'])
        by_url = {canonical(row['url'], entry['url']): row for row in page['records']}
        with Path(entry['csv_path']).open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream)
            csv_rows = [row for row in reader if any(str(v or '').strip() for v in row.values())]
        if len(csv_rows) != entry['ids_rows']:
            raise ValueError(f'CSV rows disagree with IDS UI: {entry["csv_path"]}: {len(csv_rows)} vs {entry["ids_rows"]}')
        matched = set()
        before = len(records)
        for raw in csv_rows:
            urls = {canonical(value, entry['url']) for name, value in raw.items() if 'href' in str(name).lower()}
            urls.discard(None)
            ids = {by_url[u]['id'] for u in urls if u in by_url}
            if len(ids) != 1:
                raise ValueError('IDS row did not uniquely match actual list by beer URL: ' + entry['url'])
            item = next(by_url[u].copy() for u in urls if u in by_url)
            matched.add(item['id'])
            slug = page['brewery']['slug']
            seed = seed_lookup.get(slug, {})
            item['sampling_continent'] = seed.get('continent')
            item['ids_csv_path'] = entry['csv_path']
            item['ids_exported_at'] = entry['exported_at_utc']
            item['metadata_supplement_source'] = supplement_source
            item['ids_image_url'] = next((v for k, v in raw.items() if 'src' in str(k).lower() and 'image' in str(k).lower()), None)
            item['field_provenance'] = 'List row verified by beer URL in genuine IDS CSV; stable IDs, normalized numeric fields, original image metadata and brewery location are supplemented from a public-page capture. metadata_supplement_source distinguishes the same browser snapshot from a separate fetch of the same URL.'
            raw_rows.append({'source_url': entry['url'], 'beer_id_from_public_page': item['id'], **raw})
            if item['id'] not in records and len(records) < args.target:
                records[item['id']] = item
        if matched != {r['id'] for r in page['records']}:
            warnings.append({'url': entry['url'], 'ids_matched': len(matched), 'public_list': len(page['records']), 'missing_ids': sorted({r['id'] for r in page['records']} - matched)})
        breweries[page['brewery']['id']] = page['brewery']
        pages.append({'url': entry['url'], 'page': entry['page'], 'ids_rows': len(csv_rows), 'matched_unique': len(matched), 'public_list_rows': len(page['records']), 'selected_new': len(records) - before, 'engine': entry['engine'], 'mode': entry['mode'], 'metadata_supplement_source': supplement_source, 'browser_snapshot_error': snapshot_error})
    OUT.mkdir(exist_ok=True)
    metadata = {
        'method': 'genuine_ids_csv_enriched_from_public_page_captures', 'selected_count': len(records), 'target': args.target,
        'updated_at': pilot.now(), 'selection': 'Purposively selected geographically spread breweries, native list order, per-page IDS exports. First target unique IDs are retained in manifest order; not a global random sample.',
        'source_scope': 'Public product catalogue only; not all independently verified craft, current availability or production locations.',
        'field_provenance': {'ids': ['beer URL', 'displayed name', 'displayed style', 'displayed ABV', 'displayed rating', 'DOM image source where present'], 'public_page_supplement': ['stable beer/brewery IDs', 'country/city/region', 'normalized ABV', 'IBU', 'EAN', 'style family', 'retired/draught flags', 'original product image metadata'], 'not_collected_in_list': ['structured flavor tags', 'hops', 'fermentation', 'production coordinates']},
        'records': list(records.values()),
    }
    pilot.write_json(OUT / 'beers.json', metadata)
    pilot.write_json(OUT / 'breweries.json', {'count': len(breweries), 'records': list(breweries.values()), 'location_scope': 'Brewery profile address, not verified per-product production location.'})
    audit = {'updated_at': pilot.now(), 'manifest_paths': [str(p.resolve()) for p in manifest_paths], 'pages': pages, 'page_count': len(pages), 'ids_raw_rows': len(raw_rows), 'ids_unique_beer_ids': len({r['beer_id_from_public_page'] for r in raw_rows}), 'selected_unique': len(records), 'target_complete': len(records) == args.target, 'warnings': warnings, 'countries_regions': dict(Counter(r['country_code'] for r in records.values()))}
    pilot.write_json(OUT / 'ids-ingest-audit.json', audit)
    if raw_rows:
        headers = list(dict.fromkeys(k for row in raw_rows for k in row))
        with (OUT / 'ids-consolidated.csv').open('w', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=headers)
            writer.writeheader()
            writer.writerows(raw_rows)
    if records:
        headers = [k for k in next(iter(records.values())) if k not in ('field_provenance', 'ids_csv_path')]
        with (OUT / 'beers.csv').open('w', encoding='utf-8-sig', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=headers, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(records.values())
    print(json.dumps({k:v for k,v in audit.items() if k not in ('pages','warnings')},ensure_ascii=False))
    if warnings:
        print(json.dumps({'warnings': warnings},ensure_ascii=False))


if __name__ == '__main__':
    main()
