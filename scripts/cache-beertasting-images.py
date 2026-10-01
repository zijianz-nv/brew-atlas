#!/usr/bin/env python3
"""Cache reviewed BeerTasting candidate images and make local WebP sizes.

Uses public GET requests only. Requires Pillow with WebP support. Re-running
reuses hash-verified local originals; failed URLs are retried only when the
bounded --retry-failed option is explicitly requested.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import io
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import warnings

from PIL import Image, ImageOps, features

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
MANIFEST = PUBLIC / 'data-sources/beertasting/image-cache.json'
SOURCE = PUBLIC / 'data-sources/beertasting/source-records.json'
IMAGE_ROOT = PUBLIC / 'images/beertasting'
USER_AGENT = 'BrewAtlasLocalDemo/1.0 (bounded public image cache)'
MAX_BYTES = 25 * 1024 * 1024
SIZES = {'map': (320, 160), 'card': (800, 400)}
EXTENSIONS = {'PNG': '.png', 'JPEG': '.jpg', 'WEBP': '.webp', 'GIF': '.gif', 'TIFF': '.tiff', 'BMP': '.bmp'}
blocked_hosts = set()
host_lock = threading.Lock()


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def request_url(url):
    """Use the same URL a browser requests for Unicode/space-containing paths."""
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc,
        urllib.parse.quote(parts.path, safe="/%:@!$&'()*+,;=-._~"),
        urllib.parse.quote(parts.query, safe="=&%:@!$'()*+,;/?-._~"), ''))


def local_path(web_path):
    path = (PUBLIC / web_path.lstrip('/')).resolve()
    if not path.is_relative_to(IMAGE_ROOT.resolve()):
        raise ValueError('Cache file must stay under public/images/beertasting')
    return path


def write_bytes(path, blob):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_bytes(blob)
    os.replace(temporary, path)


def inspect_original(blob):
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        image = Image.open(io.BytesIO(blob))
        image.load()
    if image.format not in EXTENSIONS:
        raise ValueError('Unsupported decoded image format: ' + str(image.format))
    if min(image.size) < 1:
        raise ValueError('Image has invalid dimensions')
    has_alpha = 'A' in image.getbands() or 'transparency' in image.info
    return image, {'format': image.format, 'mime': Image.MIME.get(image.format),
                   'width': image.width, 'height': image.height, 'hasAlpha': has_alpha,
                   'hasTransparency': has_alpha and image.convert('RGBA').getchannel('A').getextrema()[0] < 255,
                   'frames': getattr(image, 'n_frames', 1), 'bytes': len(blob), 'sha256': digest(blob)}


def alpha_metadata(blob):
    image = Image.open(io.BytesIO(blob))
    alpha = 'A' in image.getbands() or 'transparency' in image.info
    return {'hasAlpha': alpha,
            'hasTransparency': alpha and image.convert('RGBA').getchannel('A').getextrema()[0] < 255}


def derive(image, key):
    # Original bytes stay untouched; only display variants honor EXIF orientation.
    display = ImageOps.exif_transpose(image)
    alpha = 'A' in display.getbands() or 'transparency' in display.info
    display = display.convert('RGBA' if alpha else 'RGB')
    outputs = {}
    for name, size in SIZES.items():
        thumb = display.copy()
        thumb.thumbnail(size, Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        thumb.save(buffer, 'WEBP', quality=88, method=6, exact=True)
        blob = buffer.getvalue()
        path = f'/images/beertasting/{name}/{key}.webp'
        write_bytes(local_path(path), blob)
        outputs[name] = {'path': path, 'width': thumb.width, 'height': thumb.height,
                         'mime': 'image/webp', 'bytes': len(blob), 'sha256': digest(blob),
                         **alpha_metadata(blob), 'sourceHasAlpha': alpha, 'sourceDisplayWidth': display.width,
                         'sourceDisplayHeight': display.height}
    return outputs


def cache_one(row, previous, args):
    url = row['image_url']
    parsed = urllib.parse.urlparse(url)
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    record = {'sourceBeerId': row['id'], 'beerId': 'beertasting-' + row['id'],
              'sourceUrl': url, 'sourcePage': row['url'], 'sourceClass': row['image_class'],
              'imageIdentityVerified': False, 'reuseRightsVerified': False,
              'attempts': list((previous or {}).get('attempts', []))}
    try:
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Only public HTTPS URLs without embedded credentials are accepted')
        if previous and previous.get('status') == 'cached' and previous.get('original'):
            original = previous['original']
            path = local_path(original['path'])
            if path.is_file() and digest(path.read_bytes()) == original['sha256']:
                if all(local_path(previous[k]['path']).is_file()
                       and digest(local_path(previous[k]['path']).read_bytes()) == previous[k]['sha256']
                       for k in SIZES):
                    # Metadata-only correction for an already encoded file; no
                    # network request or image rewrite is needed on a rerun.
                    checked = dict(previous)
                    for variant in ['original', *SIZES]:
                        entry = checked[variant]
                        checked[variant] = {**entry, **alpha_metadata(local_path(entry['path']).read_bytes())}
                        if variant != 'original':
                            checked[variant]['sourceHasAlpha'] = checked['original']['hasAlpha']
                    return checked
                image, info = inspect_original(path.read_bytes())
                outputs = derive(image, key)
                return {**previous, **outputs, 'updatedAt': now(), 'repairedDerivativesFromLocalOriginal': True}
        if previous and previous.get('status') != 'cached':
            # Access-denied/rate-limit responses are never retried automatically.
            if previous.get('httpStatus') in [401, 403, 429] or not args.retry_failed:
                return previous
        with host_lock:
            if parsed.hostname in blocked_hosts:
                return {**record, 'status': 'skipped_rate_limited_host', 'updatedAt': now(),
                        'error': 'A previous image request to this host returned 429; no further request made.'}
        blob = None
        http_status = None
        for attempt in range(1, args.attempts + 1):
            started = time.monotonic()
            result = {'startedAt': now(), 'runAttempt': attempt}
            try:
                wire_url = request_url(url)
                result['requestUrl'] = wire_url
                request = urllib.request.Request(wire_url, headers={'User-Agent': USER_AGENT, 'Accept': 'image/*'})
                with urllib.request.urlopen(request, timeout=args.timeout) as response:
                    http_status = response.status
                    result.update({'httpStatus': response.status, 'finalUrl': response.url,
                                   'contentType': response.headers.get('Content-Type')})
                    blob = response.read(MAX_BYTES + 1)
                if len(blob) > MAX_BYTES:
                    raise ValueError('Image exceeds the 25 MiB download bound')
                result.update({'bytes': len(blob), 'elapsedMs': round((time.monotonic() - started) * 1000)})
                record['attempts'].append(result)
                break
            except urllib.error.HTTPError as error:
                http_status = error.code
                result.update({'httpStatus': error.code, 'error': str(error),
                               'elapsedMs': round((time.monotonic() - started) * 1000)})
                record['attempts'].append(result)
                if error.code == 429:
                    with host_lock:
                        blocked_hosts.add(parsed.hostname)
                if error.code in [401, 403, 429] or error.code < 500 or attempt >= args.attempts:
                    raise
            except (OSError, TimeoutError) as error:
                result.update({'error': f'{type(error).__name__}: {error}',
                               'elapsedMs': round((time.monotonic() - started) * 1000)})
                record['attempts'].append(result)
                if attempt >= args.attempts:
                    raise
            time.sleep(min(2 ** attempt, 8))
        if blob is None:
            raise ValueError('No image bytes returned')
        image, info = inspect_original(blob)
        original_path = f'/images/beertasting/original/{key}{EXTENSIONS[info["format"]]}'
        write_bytes(local_path(original_path), blob)
        outputs = derive(image, key)
        return {**record, 'status': 'cached', 'httpStatus': http_status, 'downloadedAt': now(),
                'original': {**info, 'path': original_path}, **outputs}
    except Exception as error:
        return {**record, 'status': 'failed', 'httpStatus': getattr(error, 'code', None),
                'updatedAt': now(), 'error': f'{type(error).__name__}: {error}'}


def summary(records, candidates, started):
    successful = [r for r in records if r['status'] == 'cached']
    return {'status': 'complete' if len(records) == len(candidates) else 'running',
            'startedAt': started, 'updatedAt': now(), 'candidateCount': len(candidates),
            'processed': len(records), 'cached': len(successful),
            'failed': sum(r['status'] != 'cached' for r in records),
            'originalBytes': sum(r['original']['bytes'] for r in successful),
            'mapBytes': sum(r['map']['bytes'] for r in successful),
            'cardBytes': sum(r['card']['bytes'] for r in successful)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=4, choices=range(1, 5))
    parser.add_argument('--timeout', type=int, default=25)
    parser.add_argument('--attempts', type=int, default=2, choices=[1, 2])
    parser.add_argument('--retry-failed', action='store_true')
    parser.add_argument('--source', type=Path, default=SOURCE)
    args = parser.parse_args()
    if not features.check('webp'):
        raise SystemExit('This Pillow runtime does not support WebP')
    source = json.loads(args.source.read_text())
    grouped = {}
    for row in source['records']:
        if row['image_class'] == 'candidate':
            grouped.setdefault(row['image_url'], []).append(row)
    candidates = [rows[0] for rows in grouped.values()]
    assert candidates and all(r.get('id') and r.get('image_url') for r in candidates)
    old = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    previous = {r['sourceUrl']: r for r in old.get('records', [])}
    started = old.get('startedAt') or now()
    records = {}
    params = {'map': {'maxWidth': 320, 'maxHeight': 160}, 'card': {'maxWidth': 800, 'maxHeight': 400},
              'format': 'webp', 'quality': 88, 'method': 6, 'noUpscale': True, 'crop': False,
              'resampler': 'LANCZOS', 'preserveAlpha': True, 'exifTransposeDerivativesOnly': True,
              'originalBytesUnmodified': True, 'animatedSourcesUseFirstFrameForThumbnails': True}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(cache_one, r, previous.get(r['image_url']), args): r for r in candidates}
        for future in as_completed(futures):
            result = future.result()
            result['sourceBeerIds'] = [r['id'] for r in grouped[result['sourceUrl']]]
            result['beerIds'] = ['beertasting-' + source_id for source_id in result['sourceBeerIds']]
            records[result['sourceUrl']] = result
            # Checkpoint in bounded batches; verified cached files remain reusable
            # after interruption without rewriting the whole manifest per image.
            if len(records) % 10 and len(records) != len(candidates):
                continue
            ordered = [records[r['image_url']] for r in candidates if r['image_url'] in records]
            progress = summary(ordered, candidates, started)
            manifest = {'schemaVersion': 1, **progress, 'source': '/data-sources/beertasting/source-records.json',
                        'workers': args.workers, 'maximumAttemptsPerRun': args.attempts,
                        'derivatives': params, 'imageIdentityVerified': False,
                        'records': ordered}
            write_bytes(MANIFEST, (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode())
            if len(records) % 10 == 0 or len(records) == len(candidates):
                print(json.dumps(progress), flush=True)
    print(json.dumps({'event': 'finished', **progress}), flush=True)


if __name__ == '__main__':
    main()
