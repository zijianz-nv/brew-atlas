"""Inspect up to two randomly selected public beer details per sampled brewery."""
import argparse
import importlib.util
import json
import random
import time
import urllib.parse
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pilot', Path(__file__).with_name('beertasting-pilot.py'))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
OUT = BASE / 'research/beertasting-pilot-2026-09-18'


def parse_detail(html, record):
    match = pilot.TAG.search(html)
    if not match:
        raise ValueError('Missing public page payload')
    nodes = json.loads(match.group(1))
    matches = []
    for node in nodes:
        if isinstance(node, dict) and {'id', 'slug', 'alcohol', 'description'} <= node.keys():
            if pilot.field(nodes, node, 'id') == record['id']:
                matches.append(node)
    if len(matches) != 1:
        raise ValueError('Expected one exact beer detail; got ' + str(len(matches)))
    node = matches[0]
    get = lambda key: pilot.field(nodes, node, key)
    brewery = get('brewery') or {}
    description = get('description')
    hops = get('hops')
    return {
        'id': record['id'], 'name': get('name'), 'url': record['url'],
        'country_code': record.get('country_code'), 'brewery_name': record.get('brewery_name'),
        'fermentation': get('fermentation_name'),
        'hops': [x.get('name') if isinstance(x, dict) else x for x in hops] if isinstance(hops, list) else None,
        'malts': get('malts'),
        'structured_flavor_tags': get('flavor_tags') or get('flavors') or get('flavours'),
        'description_present': bool(description), 'description_length': len(description) if isinstance(description, str) else 0,
        'brewery_id': brewery.get('id') if isinstance(brewery, dict) else None,
        'brewery_city': brewery.get('city') if isinstance(brewery, dict) else None,
        'ibu_raw': get('ibu'), 'ean_raw': get('ean'),
        'image_url': get('banner_image_url'), 'image_class': pilot.image_class(get('banner_image_url')),
        'source_updated_at': get('updated_at'),
        'raw_product_keys': [k for k in node if k not in ('reviews', 'community_rating', 'stars')],
        'missing_field_note': 'Absent structured flavors/malts are left missing; description content is not copied or treated as structured flavor data.',
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=str(OUT / 'beers.json'))
    parser.add_argument('--output', default=str(OUT / 'detail-checks.json'))
    args = parser.parse_args()
    data = json.loads(Path(args.input).read_text())
    groups = defaultdict(list)
    for row in data['records']:
        groups[row.get('listing_brewery_id') or row.get('brewery_name')].append(row)
    rng = random.Random(20260918)
    sample = []
    for key in sorted(groups):
        sample += rng.sample(sorted(groups[key], key=lambda r: r['id']), min(2, len(groups[key])))
    sample = sample[:28]
    path = Path(args.output)
    previous = json.loads(path.read_text()) if path.exists() else {}
    cache = {r['id']: r for r in previous.get('records', [])}
    records = []
    events = []
    last_request = 0
    for row in sample:
        if row['id'] in cache:
            records.append(cache[row['id']])
            continue
        event = {'id': row['id'], 'url': row['url'], 'checked_at': pilot.now()}
        try:
            time.sleep(max(0, 5 - (time.monotonic() - last_request)))
            last_request = time.monotonic()
            body, status, final_url = pilot.fetch(row['url'])
            detail = parse_detail(body.decode('utf-8'), row)
            detail['checked_at'] = pilot.now()
            records.append(detail)
            event.update(status=status, source_bytes=len(body))
        except Exception as exc:
            event.update(error=str(exc), status=getattr(exc, 'code', None))
        events.append(event)
        summary = {'method': 'Direct public HTML detail check, separate from IDS list export; at most two records per selected brewery, pseudorandom seed 20260918. No reviews or description text retained.', 'planned_count': len(sample), 'records': records, 'events': events}
        pilot.write_json(path, summary)
        print(json.dumps({'checked': len(records), 'planned': len(sample), **event}, ensure_ascii=False), flush=True)
        if event.get('status') in (401, 403, 429):
            break
    summary = {'method': 'Direct public HTML detail check, separate from IDS list export; at most two records per selected brewery, pseudorandom seed 20260918. No reviews or description text retained.', 'planned_count': len(sample), 'checked_count': len(records), 'records': records, 'events': events,
               'field_counts': {k: sum(bool(r.get(k)) for r in records) for k in ['fermentation', 'hops', 'malts', 'structured_flavor_tags', 'description_present', 'brewery_id', 'brewery_city']}}
    pilot.write_json(path, summary)
    print(json.dumps({k: v for k, v in summary.items() if k not in ('records', 'events')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
