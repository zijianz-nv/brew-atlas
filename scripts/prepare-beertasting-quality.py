#!/usr/bin/env python3
"""Merge reviewed density public-page batches without changing prior records.

Offline only. --cache-only can prepare local image work before location review
finishes; the default requires all brewery/location evidence before importing.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/beertasting-quality-2026-09-18'
DENSITY = ROOT / 'research/beertasting-density-2026-09-18'
REGIONS = ROOT / 'research/beertasting-regions-2026-09-18'
PILOT = ROOT / 'research/beertasting-pilot-2026-09-18'
EARLIER = ROOT / 'research/beertasting-geographic-expansion-2026-09-18'
SOURCE = ROOT / 'public/data-sources/beertasting'
PARTS = ['additions']


def load(path):
    return json.loads(path.read_text())


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-only', action='store_true')
    args = parser.parse_args()
    old_records = [*load(PILOT / 'beers.json')['records'], *load(EARLIER / 'beers.json')['records'], *load(REGIONS / 'beers.json')['records'], *load(DENSITY / 'beers.json')['records']]
    old_breweries = [*load(PILOT / 'breweries.json')['records'], *load(EARLIER / 'breweries.json')['records'], *load(REGIONS / 'breweries.json')['records'], *load(DENSITY / 'breweries.json')['records']]
    old_ids = {row['id'] for row in old_records}
    old_maker_ids = {row['id'] for row in old_breweries}
    assert len(old_records) == 2372 and len(old_maker_ids) == 111
    records, makers, refs, batches, duplicate_ids = {}, {}, {}, [], []
    for part in PARTS:
        directory = OUT / part
        if not (directory / 'beers.json').exists():
            if args.cache_only:
                continue
            raise ValueError(f'Missing requested regional batch: {part}')
        data = load(directory / 'beers.json')
        for row in data['records']:
            if row['id'] in old_ids or row['id'] in records:
                duplicate_ids.append({'id': row['id'], 'part': part})
                continue
            if not args.cache_only:
                assert row.get('collection_method') == 'direct_public_html', row['id']
                assert len(row.get('source_page_sha256', '')) == 64, row['id']
                assert row['brewery_id'] == row['listing_brewery_id'], row['id']
                assert not any(key.startswith('ids_') for key in row), row['id']
            records[row['id']] = row
        batches.append({**{k: v for k, v in data.items() if k != 'records'}, 'directory': str(directory.relative_to(ROOT))})
        if not args.cache_only:
            for row in load(directory / 'breweries.json')['records']:
                if row['id'] in makers:
                    assert makers[row['id']] == row, row['id']
                makers[row['id']] = row
            for row in load(directory / 'brewery-locations.json')['records']:
                key = row['sourceBreweryId']
                if key in refs:
                    assert refs[key] == row, key
                refs[key] = row
    additions = list(records.values())
    save(OUT / 'cache-source.json', {'records': [*old_records, *additions]})
    if args.cache_only:
        print(json.dumps({'newRecordsReadyForCache': len(additions), 'newCandidateImages': sum(r['image_class'] == 'candidate' for r in additions)}))
        return
    used = {row['brewery_id'] for row in additions}
    new_ids = used - old_maker_ids
    assert new_ids <= makers.keys() and new_ids <= refs.keys(), 'Unreviewed brewery/location'
    for key in new_ids:
        brewery, reference = makers[key], refs[key]
        assert brewery['country'] == reference['countryCode']
        assert brewery['city'] == reference['city']
        assert reference['locationPrecision'] == 'city' and reference['productionLocationVerified'] is False
        assert reference['coordinateSourceUrl'] and reference['identitySourceUrl'] and reference['verificationNote']
    ordered_makers = [makers[key] for key in sorted(new_ids)]
    ordered_refs = [refs[key] for key in sorted(new_ids)]
    old_refs = [r for r in load(SOURCE / 'brewery-locations.json')['records'] if r['sourceBreweryId'] in old_maker_ids]
    assert len(old_refs) == 111
    updated = max(batch.get('updated_at', '') for batch in batches)
    save(OUT / 'beers.json', {'method': 'direct_public_html', 'batch': 'quality_public_html_20260918',
        'updated_at': updated, 'selected_count': len(additions), 'regional_batches': batches,
        'selection': 'New city references across the Americas, Africa, Eurasia and Oceania, prioritizing geographic gaps. Preserve prior 2372 records. Source IDs deduplicated; locality references reviewed separately; no production-site claim.',
        'records': additions})
    save(OUT / 'breweries.json', {'count': len(ordered_makers), 'records': ordered_makers})
    save(OUT / 'brewery-locations.json', {'records': ordered_refs})
    save(OUT / 'merge-audit.json', {'createdAt': datetime.now(timezone.utc).isoformat(), 'priorRecords': 2372,
        'newRecords': len(additions), 'newBreweries': len(new_ids), 'duplicateIdsExcluded': duplicate_ids,
        'originalIdsSha256': hashlib.sha256('\n'.join(r['id'] for r in old_records).encode()).hexdigest()})
    save(SOURCE / 'brewery-locations.json', {'scope': 'Reviewed pilot, geographic expansion, and requested regional and density city references; not exact production sites.',
        'verifiedAt': '2026-09-18', 'records': [*old_refs, *ordered_refs]})
    print(json.dumps({'newBeers': len(additions), 'newBreweries': len(new_ids),
        'newUniqueCoordinates': len({(r['lat'], r['lng']) for r in ordered_refs}), 'totalBeers': len(old_records) + len(additions)}))


if __name__ == '__main__':
    main()
