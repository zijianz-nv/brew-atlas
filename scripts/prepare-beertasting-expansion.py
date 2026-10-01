#!/usr/bin/env python3
"""Prepare deduplicated facts from saved public HTML list parses; no network."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/beertasting-geographic-expansion-2026-09-18'
PILOT = ROOT / 'research/beertasting-pilot-2026-09-18'
BATCH = 'geographic_public_html_20260918'


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    original = json.loads((PILOT / 'beers.json').read_text())
    old_ids = {r['id'] for r in original['records']}
    seeds = {s['slug']: s for p in sorted(OUT.glob('seeds-wave*.json'))
             for s in json.loads(p.read_text())['seeds']}
    records, breweries, rejected, pages = {}, {}, [], []
    for path in sorted(OUT.glob('wave*/pages/*.json')):
        page = json.loads(path.read_text())
        brewery = page['brewery']
        assert page['http_status'] == 200
        seed = seeds[brewery['slug']]
        pages.append({k: page[k] for k in ['url', 'fetched_at', 'http_status', 'source_bytes', 'source_sha256', 'meta']})
        breweries[brewery['id']] = brewery
        for raw in page['records']:
            if raw['id'] in old_ids or raw['id'] in records:
                continue
            if raw['brewery_id'] != brewery['id']:
                rejected.append({'id': raw['id'], 'source_url': page['url'], 'reason': 'maker relationship not exact'})
                continue
            records[raw['id']] = {**raw, 'sampling_continent': seed['continent'],
                'collection_method': 'direct_public_html', 'collection_batch': BATCH,
                'captured_at': page['fetched_at'], 'source_page_sha256': page['source_sha256'],
                'field_provenance': 'Stable ID, maker relationship, numerical ratings/counts and candidate image URL read from the exact public brewery-list Nuxt data; no IDS extension used for this expansion.'}
    values = sorted(records.values(), key=lambda r: (r['brewery_id'], r['source_url'], r['id']))
    used = {r['brewery_id'] for r in values}
    latest = max(p['fetched_at'] for p in pages)
    data = {'method': 'direct_public_html', 'batch': BATCH, 'updated_at': latest,
            'selection': 'Geographically targeted breweries; at most two ordinary public HTML pages per brewery. No login or private API. Includes source-listed beers without candidate images; no claim of independent-craft certification.',
            'selected_count': len(values), 'records': values}
    write(OUT / 'beers.json', data)
    write(OUT / 'breweries.json', {'count': len(used), 'records': [breweries[k] for k in sorted(used)]})
    write(OUT / 'page-audit.json', {'method': 'direct_public_html', 'batch': BATCH, 'pages': pages, 'rejected': rejected})
    write(OUT / 'cache-source.json', {'records': [*original['records'], *values]})
    print(json.dumps({'newBeers': len(values), 'newBreweries': len(used), 'candidateImages': sum(r['image_class'] == 'candidate' for r in values), 'rejected': len(rejected), 'pages': len(pages)}))


if __name__ == '__main__':
    main()
