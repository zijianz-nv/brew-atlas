"""Check a reproducible random sample of candidate image URLs using HEAD only."""
import argparse
import datetime as dt
import hashlib
import json
import math
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'research/beertasting-pilot-2026-09-18'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=str(OUT / 'beers.json'))
    parser.add_argument('--sample-size', type=int, default=100)
    parser.add_argument('--output', default=str(OUT / 'image-checks.json'))
    args = parser.parse_args()
    if not 1 <= args.sample_size <= 100:
        parser.error('At most 100 candidate image URLs in this pilot')
    data = json.loads(Path(args.input).read_text())
    candidates = [r for r in data['records'] if r.get('image_class') == 'candidate' and r.get('image_url')]
    by_url = {r['image_url']: r for r in candidates}
    selected = random.Random(20260918).sample(sorted(by_url), min(args.sample_size, len(by_url)))
    output = Path(args.output)
    previous = json.loads(output.read_text()).get('checks', []) if output.exists() else []
    cache = {x['url']: x for x in previous}
    checks = []
    summary = {'input_path': str(Path(args.input).resolve()), 'input_sha256': hashlib.sha256(Path(args.input).read_bytes()).hexdigest(), 'candidate_records': len(candidates), 'distinct_candidate_urls': len(by_url), 'planned_sample': len(selected), 'random_seed': 20260918, 'checks': checks, 'method': 'Uniform pseudorandom sample without replacement of distinct candidate image URLs; HEAD only, no image files downloaded.', 'scope': 'URL reachability and response MIME only; not visual product-photo correctness or a global population estimate.'}
    for url in selected:
        if url in cache:
            checks.append(cache[url])
            continue
        if urllib.parse.urlsplit(url).hostname not in ('beertasting.app', 'www.beertasting.app', 'beertasting.com', 'www.beertasting.com'):
            raise ValueError('Unexpected image host; inspect explicitly before requesting ' + url)
        row = by_url[url]
        item = {'beer_id': row['id'], 'url': url, 'country_code': row.get('country_code'), 'checked_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'method': 'HEAD'}
        request = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'BrewAtlasResearch/1.0 (bounded image availability check)'})
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                item.update(status=response.status, mime=response.headers.get('Content-Type'), content_length=response.headers.get('Content-Length'))
                item['accessible_image_response'] = response.status == 200 and str(item['mime']).lower().startswith('image/') and item['content_length'] != '0'
        except Exception as exc:
            item.update(status=getattr(exc, 'code', None), error=str(exc), accessible_image_response=False)
        checks.append(item)
        output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'checked': len(checks), 'planned': len(selected), 'status': item['status'], 'accessible': item['accessible_image_response']}, ensure_ascii=False), flush=True)
        if item['status'] in (401, 403, 429):
            print('Stopped image sample on access/rate restriction.', flush=True)
            break
        time.sleep(1.5)
    if checks:
        success = sum(x['accessible_image_response'] for x in checks)
        n = len(checks)
        p = success / n
        z = 1.96
        center = (p + z*z/(2*n)) / (1+z*z/n)
        half = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
        summary.update(checked_count=n, accessible_count=success, accessible_ratio=p, wilson_95_interval=[center-half, center+half])
        output.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({k:v for k,v in summary.items() if k!='checks'},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
