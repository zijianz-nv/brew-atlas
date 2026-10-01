"""Bounded, resumable public-page pilot. No login, private API, or image downloads.

This is a direct HTML collector for validation/fallback, not Instant Data Scraper.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'research/beertasting-pilot-2026-09-18'
TAG = re.compile(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', re.S)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def hydrate(nodes, index, stack=()):
    if type(index) is not int:
        return index
    if index < 0:
        return 0 if index == -6 else None
    if index in stack or len(stack) > 60:
        raise ValueError('Unexpected cyclic/deep Nuxt field')
    value = nodes[index]
    stack = (*stack, index)
    if isinstance(value, dict):
        return {k: hydrate(nodes, v, stack) for k, v in value.items()}
    if isinstance(value, list):
        if value and isinstance(value[0], str):
            if value[0] in ('Reactive', 'ShallowReactive', 'Ref', 'ShallowRef'):
                return hydrate(nodes, value[1], stack)
            if value[0] == 'Date':
                return value[1]
            raise ValueError('Unsupported Nuxt wrapper: ' + value[0])
        return [hydrate(nodes, v, stack) for v in value]
    return value


def field(nodes, node, key):
    return hydrate(nodes, node[key]) if key in node else None


def image_class(url):
    if not url:
        return 'missing'
    path = urllib.parse.urlsplit(url).path.lower()
    if '/static/' in path or re.search(r'(placeholder|fallback|default[_-]|no[_-]?image)', path):
        return 'placeholder'
    return 'candidate'


class NextPageLink(HTMLParser):
    def __init__(self, source, page):
        super().__init__()
        self.source = source
        self.page = page
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag not in ('a', 'link') or not attrs.get('href'):
            return
        url = urllib.parse.urljoin(self.source, attrs['href'])
        parsed = urllib.parse.urlsplit(url)
        source = urllib.parse.urlsplit(self.source)
        if parsed.hostname == source.hostname and parsed.path == source.path and urllib.parse.parse_qs(parsed.query).get('page') == [str(self.page + 1)]:
            self.urls.add(url)


def parse_page(html, url):
    match = TAG.search(html)
    if not match:
        raise ValueError('Public page did not contain Nuxt data')
    nodes = json.loads(match.group(1))
    lists = []
    breweries = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        if {'beers_count', 'country_name', 'slug', 'name', 'id'} <= node.keys():
            breweries.append({k: field(nodes, node, k) for k in ['id', 'name', 'slug', 'city', 'region', 'country', 'country_name', 'street', 'zip', 'beers_count', 'homepage_link']})
        if {'data', 'meta', 'links'} <= node.keys():
            meta = field(nodes, node, 'meta')
            if isinstance(meta, dict) and {'current_page', 'per_page', 'last_page', 'total'} <= meta.keys():
                lists.append((field(nodes, node, 'data'), meta, field(nodes, node, 'links')))
    slug = urllib.parse.urlsplit(url).path.rstrip('/').split('/')[-2]
    breweries = {b['id']: b for b in breweries if b['slug'] == slug}
    if len(lists) != 1 or len(breweries) != 1:
        raise ValueError(f'Expected one exact beer list and brewery; got {len(lists)}, {len(breweries)}')
    brewery = next(iter(breweries.values()))
    beers, meta, links = lists[0]
    if not isinstance(beers, list):
        raise ValueError('List response has wrong shape')
    if beers and len(beers) != meta['to'] - meta['from'] + 1:
        raise ValueError('List size disagrees with pagination')
    records = []
    for beer in beers:
        if not beer.get('id') or not beer.get('slug') or not beer.get('name'):
            raise ValueError('Beer lacks stable identity')
        abv = beer.get('alcohol')
        if abv is not None and (type(abv) not in (int, float) or not 0 <= abv <= 1):
            raise ValueError('Unexpected ABV fraction')
        country = beer.get('country') or {}
        maker = beer.get('brewery')
        maker_name = maker.get('name') if isinstance(maker, dict) else maker
        same_maker = maker_name == brewery['name']
        image = beer.get('banner_image_url')
        banner = beer.get('banner_image') or {}
        records.append({
            'id': beer['id'], 'name': beer['name'], 'display_name': beer.get('display_name'),
            'url': 'https://www.beertasting.com/en/beers/' + beer['slug'],
            'brewery_name': maker_name,
            'secondary_brewery_name': beer.get('secondary_brewery'),
            'brewery_id': maker.get('id') if isinstance(maker, dict) else brewery['id'] if same_maker else None,
            'brewery_city': brewery['city'] if same_maker else None,
            'brewery_region': brewery['region'] if same_maker else None,
            'brewery_country_code': brewery['country'] if same_maker else None,
            'country_code': country.get('alpha_2'), 'country_name': country.get('name'),
            'abv_percent': round(abv * 100, 3) if abv is not None else None,
            'ibu_raw': beer.get('ibu'), 'style_family': beer.get('beer_type_family_name'),
            'style': beer.get('beer_type_name'), 'ean_raw': beer.get('ean'),
            'rating': beer.get('avg_rating'), 'ratings_count': beer.get('ratings_count'),
            'is_retired': beer.get('is_retired'), 'is_draught': beer.get('is_draught'),
            'image_url': image, 'image_class': image_class(image),
            'image_media_id': banner.get('uuid'), 'image_declared_mime': banner.get('mime_type'),
            'source_url': url, 'listing_brewery_id': brewery['id'],
            'fermentation': None, 'hops': None, 'malts': None, 'flavor_tags': None,
            'latitude': None, 'longitude': None,
        })
    navigation = NextPageLink(url, meta['current_page'])
    navigation.feed(html)
    if len(navigation.urls) > 1:
        raise ValueError('Ambiguous public next-page link')
    next_url = next(iter(navigation.urls), None)
    if meta['current_page'] < meta['last_page'] and next_url is None:
        raise ValueError('Expected public next-page link was missing')
    return {'url': url, 'brewery': brewery, 'meta': {k: meta[k] for k in ['current_page', 'last_page', 'per_page', 'total']}, 'next_url': next_url, 'records': records}


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'BrewAtlasResearch/1.0 (bounded beer catalogue pilot)', 'Accept': 'text/html'})
    with urllib.request.urlopen(request, timeout=35) as response:
        body = response.read(5_000_001)
        if len(body) > 5_000_000:
            raise ValueError('Page exceeded 5 MB cap')
        if urllib.parse.urlsplit(response.url).hostname not in ('www.beertasting.com', 'beertasting.com'):
            raise ValueError('Unexpected redirect host')
        return body, response.status, response.url


def write_json(path, data):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def collect(args):
    out = Path(args.output).resolve() if args.output else OUT
    out.mkdir(parents=True, exist_ok=True)
    pages_dir = out / 'pages'
    pages_dir.mkdir(exist_ok=True)
    seeds = json.loads(Path(args.seeds).read_text())
    if isinstance(seeds, dict):
        seeds = seeds['seeds']
    state = [{'seed': seed, 'url': seed.get('url') or seed['beers_url'], 'seen': set(), 'pages': 0} for seed in seeds]
    selected = {}
    audit = []
    last_request = 0
    blocked = False
    while len(selected) < args.target and not blocked:
        progressed = False
        for task in state:
            if len(selected) >= args.target:
                break
            url = task['url']
            if not url or url in task['seen'] or task['pages'] >= args.max_pages_per_brewery:
                continue
            parsed = urllib.parse.urlsplit(url)
            if parsed.hostname not in ('www.beertasting.com', 'beertasting.com') or not re.fullmatch(r'/en/brewery/[^/]+/beers/?', parsed.path):
                raise ValueError('Non-public-list URL outside collection scope: ' + url)
            task['seen'].add(url)
            key = hashlib.sha256(url.encode()).hexdigest()[:24]
            cache = pages_dir / (key + '.json')
            log = {'url': url, 'started_at': now()}
            try:
                if cache.exists():
                    data = json.loads(cache.read_text())
                    log['status'] = 'cached'
                else:
                    time.sleep(max(0, args.delay - (time.monotonic() - last_request)))
                    last_request = time.monotonic()
                    body, status, final_url = fetch(url)
                    data = parse_page(body.decode('utf-8'), url)
                    data['fetched_at'] = now()
                    data['http_status'] = status
                    data['final_url'] = final_url
                    data['source_bytes'] = len(body)
                    data['source_sha256'] = hashlib.sha256(body).hexdigest()
                    write_json(cache, data)
                    log['status'] = status
                before = len(selected)
                for beer in data['records']:
                    if beer['id'] in selected:
                        continue
                    if len(selected) < args.target:
                        selected[beer['id']] = beer
                log.update(rows=len(data['records']), selected_new=len(selected) - before, unique_total=len(selected), page=data['meta']['current_page'], listed_total=data['meta']['total'])
                task['pages'] += 1
                task['url'] = data['next_url'] if data['records'] and len(selected) > before else None
                if task['url']:
                    task['url'] = urllib.parse.urljoin(url, task['url'])
                progressed = True
            except Exception as exc:
                log.update(error=str(exc), status=getattr(exc, 'code', None))
                task['url'] = None
                if log['status'] in (401, 403, 429):
                    blocked = True
            audit.append(log)
            write_json(out / 'collection-audit.json', {'method': 'direct_public_html_not_ids', 'target': args.target, 'delay_seconds': args.delay, 'events': audit, 'blocked': blocked, 'unique_selected': len(selected), 'updated_at': now()})
            write_json(out / 'beers.json', {'method': 'direct_public_html_not_ids', 'selected_count': len(selected), 'selection': 'Round-robin across explicitly chosen brewery lists in site order; not a random global sample.', 'updated_at': now(), 'records': list(selected.values())})
            print(json.dumps(log, ensure_ascii=False), flush=True)
            if blocked:
                break
        if not progressed:
            break
    print(json.dumps({'complete': len(selected) == args.target, 'unique': len(selected), 'blocked': blocked}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--seeds', required=True)
    parser.add_argument('--target', type=int, default=1000)
    parser.add_argument('--delay', type=float, default=5)
    parser.add_argument('--max-pages-per-brewery', type=int, default=10)
    parser.add_argument('--output', help='Separate output directory for an independent collection run')
    options = parser.parse_args()
    if not 1 <= options.target <= 1000 or options.delay < 5 or not 1 <= options.max_pages_per_brewery <= 25:
        parser.error('Pilot bounds: <=1000 selected records, >=5s delay, <=25 pages per brewery')
    collect(options)
