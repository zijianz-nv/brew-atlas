"""Recover exact product descriptions from archived public Nuxt pages.

Offline by default. Optional bounded public-detail fetching fills breweries that
still lack a described image; no accounts, API endpoints, reviews or generated copy.
"""
import argparse
import collections
import concurrent.futures
import hashlib
import html
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import re
import threading
import time
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pilot', ROOT / 'scripts/beertasting-pilot.py')
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)
DEFAULT_OUT = ROOT / 'research/beertasting-descriptions-2026-09-18'


class PageMeta(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href')


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.ignored += 1
        if tag in ('br', 'p', 'div', 'li'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.ignored:
            self.ignored -= 1
        if tag in ('p', 'div', 'li'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def plain_text(value):
    if not isinstance(value, str):
        return ''
    parser = PlainText()
    parser.feed(value)
    text = html.unescape(''.join(parser.parts)).replace('\r\n', '\n').replace('\r', '\n')
    return '\n'.join(line.strip() for line in text.splitlines() if line.strip()).strip()


def public_url(value):
    parsed = urllib.parse.urlsplit(value or '')
    return parsed.scheme == 'https' and parsed.hostname in ('www.beertasting.com', 'beertasting.com') and bool(re.fullmatch(r'/en/(?:beers/[^/]+|brewery/[^/]+/beers)/?', parsed.path))


def input_records(paths):
    records = {}
    for path in paths:
        data = json.loads(path.read_text())
        for entry in data.get('beers', data.get('records', [])):
            source = entry.get('sourceRecord', entry)
            uuid = source.get('id', entry.get('id', '')).removeprefix('beertasting-')
            url = source.get('url')
            if not uuid or not public_url(url) or '/en/beers/' not in url:
                continue
            records[uuid] = {
                'id': uuid, 'beerId': 'beertasting-' + uuid, 'name': source.get('name'),
                'brewery_id': source.get('brewery_id'), 'brewery_name': source.get('brewery_name'),
                'productUrl': url, 'sourcePageSha256': source.get('source_page_sha256'),
                'hasImage': bool(entry.get('image')) if 'sourceRecord' in entry else source.get('image_class') == 'candidate',
                'rating': source.get('rating'), 'ratingsCount': source.get('ratings_count'),
            }
    return records


def rank(beer):
    rating, count = beer.get('rating'), beer.get('ratingsCount')
    valid = type(rating) in (int, float) and 0 <= rating <= 5 and type(count) is int and count > 0
    tier = 2 if valid and count >= 10 else 1 if valid else 0
    return (-tier, -rating if valid else 0, -count if valid else 0, beer['id'])


def path_text(path):
    return str(path.resolve().relative_to(ROOT))


def archive_files(out):
    paths = set((ROOT / 'research').rglob('*.html'))
    for directory in ('ids-pilot', 'ids-pilot-secondary', 'beertasting-sample-20260918', 'access-cases-20260918'):
        paths.update((ROOT / '.runtime' / directory).rglob('*.html'))
    paths.update((out / 'raw').glob('*.html'))
    return sorted(paths)


def archive_metadata():
    result = {}
    for manifest in (ROOT / '.runtime').glob('ids-pilot*/manifest.jsonl'):
        for line in manifest.read_text().splitlines():
            try:
                entry = json.loads(line)
                result[str(Path(entry['html_path']).resolve())] = {
                    'url': entry['url'], 'capturedAt': entry.get('exported_at_utc'),
                    'httpStatus': entry.get('http_status'), 'metadataFile': path_text(manifest),
                }
            except (ValueError, KeyError):
                continue
    return result


def page_metadata(path, index):
    if str(path.resolve()) in index:
        return index[str(path.resolve())]
    for file in (path.with_suffix('.json'), path.parent.parent / 'pages' / (path.stem + '.json')):
        if not file.exists():
            continue
        try:
            entry = json.loads(file.read_text())
            if public_url(entry.get('url')):
                return {'url': entry['url'], 'capturedAt': entry.get('fetched_at') or entry.get('capturedAt'),
                        'httpStatus': entry.get('http_status'), 'metadataFile': path_text(file)}
        except (ValueError, KeyError):
            continue
    return {}


def extract(body, source_file, records, metadata=None):
    metadata = metadata or {}
    text = body.decode('utf-8')
    match = pilot.TAG.search(text)
    if not match:
        return [], {'status': 'no_nuxt', 'sourceFile': path_text(source_file)}
    nodes = json.loads(match.group(1))
    parser = PageMeta()
    parser.feed(text)
    url = metadata.get('url') or parser.canonical
    if not public_url(url):
        return [], {'status': 'non_product_or_list_url', 'sourceFile': path_text(source_file)}
    is_detail = '/en/beers/' in urllib.parse.urlsplit(url).path
    # A canonical link can omit ?page=N; recover list pagination only when the
    # archived manifest or parsed-page sidecar did not supply the actual URL.
    if not metadata.get('url') and not is_detail:
        for node in nodes:
            if isinstance(node, dict) and {'data', 'meta', 'links'} <= node.keys():
                meta = pilot.field(nodes, node, 'meta')
                if isinstance(meta, dict) and meta.get('per_page') == 15 and meta.get('current_page', 0) > 1:
                    url = url.split('?')[0] + '?page=' + str(meta['current_page'])
                    break
    sha = hashlib.sha256(body).hexdigest()
    found, empty, rejected = [], 0, []
    for i, node in enumerate(nodes):
        if not isinstance(node, dict) or not {'id', 'slug', 'name', 'description', 'alcohol', 'beer_type_name', 'avg_rating'} <= node.keys():
            continue
        uuid = pilot.field(nodes, node, 'id')
        if not isinstance(uuid, str) or uuid not in records:
            continue
        expected = records[uuid]
        slug = pilot.field(nodes, node, 'slug')
        product_url = 'https://www.beertasting.com/en/beers/' + str(slug)
        if urllib.parse.urlsplit(expected['productUrl']).path.rstrip('/') != urllib.parse.urlsplit(product_url).path:
            rejected.append({'id': uuid, 'reason': 'slug_identity_mismatch'})
            continue
        if is_detail and urllib.parse.urlsplit(url).path.rstrip('/') != urllib.parse.urlsplit(product_url).path:
            continue
        maker = pilot.field(nodes, node, 'brewery')
        if isinstance(maker, dict) and maker.get('id') and maker['id'] != expected['brewery_id']:
            rejected.append({'id': uuid, 'reason': 'brewery_identity_mismatch'})
            continue
        original = pilot.field(nodes, node, 'description')
        description = plain_text(original)
        if not description or description.lower() in ('n/a', 'none', 'null', '-', 'no description', 'no description available'):
            empty += 1
            continue
        found.append({
            'id': uuid, 'beerId': expected['beerId'], 'brewery_id': expected['brewery_id'],
            'description': original, 'originalDescription': original, 'plainDescription': description,
            'sourceUrl': url, 'productUrl': product_url, 'sourceSha256': sha,
            'sourceFile': path_text(source_file), 'sourceFieldPath': f'__NUXT_DATA__[{i}].description',
            'sourceNodeIndex': i, 'sourceValueNodeIndex': node['description'],
            'sourceKind': 'archived_public_detail' if is_detail else 'archived_public_list',
            'sourceCapturedAt': metadata.get('capturedAt'),
            'sourceUpdatedAt': pilot.field(nodes, node, 'updated_at'),
            'matchesImportedPageHash': bool(expected.get('sourcePageSha256') == sha),
            'extractedAt': pilot.now(), 'language': 'source_en_route_not_independently_verified',
            'fieldMeaning': 'BeerTasting product.description; not brewery text, review text, manufacturer-authorship certification, or inferred flavor data.',
        })
    return found, {'status': 'parsed', 'sourceFile': path_text(source_file), 'sourceUrl': url,
        'sourceSha256': sha, 'sourceBytes': len(body), 'sourceCapturedAt': metadata.get('capturedAt'),
        'httpStatus': metadata.get('httpStatus'), 'descriptionMatches': len(found),
        'emptyDescriptions': empty, 'rejected': rejected}


def evidence_rank(row):
    return (row.get('matchesImportedPageHash', False), row.get('sourceUpdatedAt') or '',
            row.get('sourceCapturedAt') or '', row['sourceKind'] == 'archived_public_detail', row['sourceFile'])


def collect(args):
    out = args.output.resolve()
    (out / 'raw').mkdir(parents=True, exist_ok=True)
    records = input_records([args.input, *args.extra_input])
    selected, events, conflicts = {}, [], []
    previous_audit = out / 'page-audit.json'
    if previous_audit.exists():
        previous = json.loads(previous_audit.read_text())
        events.extend(event for event in previous.get('pages', []) if event.get('kind') == 'public_detail_fetch')
    metadata = archive_metadata()
    blocked = threading.Event()
    image_groups = collections.defaultdict(list)
    for record in records.values():
        if record['hasImage']:
            image_groups[record['brewery_id']].append(record)
    for group in image_groups.values():
        group.sort(key=rank)

    def covered():
        return {records[id]['brewery_id'] for id in selected if records[id]['hasImage']}

    def merge(rows):
        for row in rows:
            old = selected.get(row['id'])
            if old and old['originalDescription'] != row['originalDescription']:
                conflicts.append({'id': row['id'], 'leftSourceFile': old['sourceFile'], 'rightSourceFile': row['sourceFile'],
                    'policy': 'Prefer exact imported source-page hash, then product updated_at, then known capture time, then detail and stable file path.'})
            if not old or evidence_rank(row) > evidence_rank(old):
                selected[row['id']] = row

    def save():
        coverage = covered()
        pilot.write_json(out / 'descriptions.json', {'method': 'exact_uuid_public_product_description', 'updated_at': pilot.now(),
            'records': sorted(selected.values(), key=lambda x: x['id']),
            'coverage': {'inputRecords': len(records), 'describedRecords': len(selected),
                'describedRecordsWithImages': sum(records[id]['hasImage'] for id in selected),
                'breweriesWithImages': len(image_groups), 'breweriesWithDescribedImages': len(coverage),
                'missingImageBreweryIds': sorted(set(image_groups) - coverage),
                'imagePresenceBasis': 'Cached image for imported demo rows; candidate URL for additional raw-source rows.'},
            'note': 'description and originalDescription preserve exact source strings; plainDescription is HTML-stripped display text. No summaries or generated substitutes. Product field may be platform/editorial content; manufacturer authorship is not asserted.'})
        pilot.write_json(out / 'page-audit.json', {'updated_at': pilot.now(), 'pages': events, 'conflicts': conflicts,
            'blocked': blocked.is_set(), 'networkConcurrency': args.workers if args.fetch_missing_breweries else 0,
            'minimumSecondsBetweenRequestStartsPerWorker': args.delay,
            'selection': 'Offline archives first; optional network only for image-bearing breweries still lacking a description, high-ranked image beer first, bounded attempts per brewery.'})

    for path in archive_files(out):
        try:
            rows, event = extract(path.read_bytes(), path, records, page_metadata(path, metadata))
            merge(rows)
        except Exception as error:
            event = {'status': 'archive_parse_error', 'sourceFile': path_text(path), 'error': str(error)}
        events.append(event)
    save()
    print(json.dumps({'phase': 'archives', 'descriptions': len(selected), 'imageBreweriesCovered': len(covered()), 'imageBreweries': len(image_groups)}), flush=True)
    if not args.fetch_missing_breweries:
        return

    state = threading.local()
    attempts = collections.Counter()
    archived_detail_urls = {event.get('sourceUrl') for event in events if event.get('status') == 'parsed' and '/en/beers/' in (event.get('sourceUrl') or '')}
    scheduled = {beer['id'] for beer in records.values() if beer['productUrl'] in archived_detail_urls}
    for beer_id in scheduled:
        attempts[records[beer_id]['brewery_id']] += 1
    pages_requested = 0

    def fetch_one(beer):
        elapsed = time.monotonic() - getattr(state, 'last_request', 0)
        if blocked.wait(max(0, args.delay - elapsed)):
            return [], {'status': 'stopped_before_request', 'id': beer['id']}
        state.last_request = time.monotonic()
        event = {'id': beer['id'], 'sourceUrl': beer['productUrl'], 'requestedAt': pilot.now(), 'kind': 'public_detail_fetch', 'worker': threading.current_thread().name}
        try:
            body, status, final_url = pilot.fetch(beer['productUrl'])
            if urllib.parse.urlsplit(final_url).path.rstrip('/') != urllib.parse.urlsplit(beer['productUrl']).path.rstrip('/'):
                raise ValueError('Detail redirected to a different product path')
            path = out / 'raw' / (beer['id'] + '.html')
            path.write_bytes(body)
            captured_at = pilot.now()
            sidecar = {'url': final_url, 'fetched_at': captured_at, 'http_status': status,
                'source_sha256': hashlib.sha256(body).hexdigest(), 'source_bytes': len(body)}
            pilot.write_json(path.with_suffix('.json'), sidecar)
            rows, parsed = extract(body, path, records, {'url': final_url, 'capturedAt': captured_at, 'httpStatus': status})
            event.update(parsed, networkStatus=status)
            return rows, event
        except Exception as error:
            status = getattr(error, 'code', None)
            if status in (401, 403, 429):
                blocked.set()
            event.update(status='fetch_error', httpStatus=status, error=str(error))
            return [], event

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending = {}
        while True:
            in_flight_makers = {beer['brewery_id'] for beer in pending.values()}
            while len(pending) < args.workers and pages_requested < args.max_pages and not blocked.is_set():
                uncovered = sorted(set(image_groups) - covered() - in_flight_makers,
                    key=lambda id: (attempts[id], id))
                choice = None
                for maker in uncovered:
                    if attempts[maker] >= args.max_per_brewery:
                        continue
                    choice = next((b for b in image_groups[maker] if b['id'] not in scheduled and b['id'] not in selected), None)
                    if choice:
                        break
                if not choice:
                    break
                scheduled.add(choice['id'])
                attempts[choice['brewery_id']] += 1
                pages_requested += 1
                in_flight_makers.add(choice['brewery_id'])
                pending[pool.submit(fetch_one, choice)] = choice
            if not pending:
                break
            done, _ = concurrent.futures.wait(pending, return_when=concurrent.futures.FIRST_COMPLETED)
            for future in done:
                beer = pending.pop(future)
                rows, event = future.result()
                merge(rows)
                events.append(event)
                save()
                print(json.dumps({'id': beer['id'], 'status': event['status'], 'added': len(rows),
                    'descriptions': len(selected), 'imageBreweriesCovered': len(covered()), 'requested': pages_requested}), flush=True)
    save()


def self_test():
    assert plain_text('<p>A &amp; B</p><script>unsafe</script><p>Second</p>') == 'A & B\nSecond'
    assert plain_text(None) == '' and plain_text(' \n ') == ''
    assert rank({'id': 'a', 'rating': 4.2, 'ratingsCount': 100}) < rank({'id': 'b', 'rating': 5, 'ratingsCount': 1})
    assert not public_url('https://example.com/en/beers/beer')
    nodes = [{'id': 1, 'slug': 2, 'name': 3, 'description': 4, 'alcohol': 5, 'beer_type_name': 6, 'avg_rating': 7},
        'uuid', 'example-beer', 'Example', 'A real source product field.', .05, 'IPA', 4]
    body = ('<link rel="canonical" href="https://www.beertasting.com/en/beers/example-beer">'
        '<script id="__NUXT_DATA__">' + json.dumps(nodes) + '</script>').encode()
    records = {'uuid': {'id': 'uuid', 'beerId': 'beertasting-uuid', 'brewery_id': 'maker',
        'productUrl': 'https://www.beertasting.com/en/beers/example-beer'}}
    rows, _ = extract(body, ROOT / 'synthetic-test-only.html', records)
    assert rows[0]['originalDescription'] == nodes[4] and rows[0]['sourceValueNodeIndex'] == 4
    assert rows[0]['sourceSha256'] == hashlib.sha256(body).hexdigest()
    assert extract(body, ROOT / 'synthetic-test-only.html', {})[0] == []
    nodes[0].pop('alcohol')
    review_body = ('<link rel="canonical" href="https://www.beertasting.com/en/beers/example-beer">'
        '<script id="__NUXT_DATA__">' + json.dumps(nodes) + '</script>').encode()
    assert extract(review_body, ROOT / 'synthetic-test-only.html', records)[0] == []
    print('Self-test passed: exact identity, product schema, HTML text, provenance, rating tier, URL scope.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'public/data/beertasting.json')
    parser.add_argument('--extra-input', action='append', type=Path, default=[])
    parser.add_argument('--output', type=Path, default=DEFAULT_OUT)
    parser.add_argument('--fetch-missing-breweries', action='store_true')
    parser.add_argument('--workers', type=int, default=2)
    parser.add_argument('--delay', type=float, default=5)
    parser.add_argument('--max-pages', type=int, default=150)
    parser.add_argument('--max-per-brewery', type=int, default=3)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.workers not in (1, 2) or args.delay < 5 or not 0 <= args.max_pages <= 200 or not 1 <= args.max_per_brewery <= 5:
        parser.error('Bounds: 1–2 workers, >=5s per worker, <=200 pages/run, <=5 attempts per brewery.')
    if args.self_test:
        self_test()
    else:
        collect(args)
