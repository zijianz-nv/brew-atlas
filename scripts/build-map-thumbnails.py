#!/usr/bin/env python3
"""Build bounded map assets from reviewed local photos; never alter originals."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 10_000
REGISTRY = ROOT / 'public/data-sources/map-thumbnails.json'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def local(path):
    if not isinstance(path, str) or not path.startswith('/images/') or '..' in path:
        raise ValueError(f'Not a local reviewed image: {path}')
    return ROOT / 'public' / path.lstrip('/')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--catalog', action='append', default=[])
    args = parser.parse_args()
    catalogs = args.catalog or ['public/data/catalog.json']
    previous = json.loads(REGISTRY.read_text()) if REGISTRY.exists() else {'entries': []}
    entries = {entry['sourcePath']: entry for entry in previous['entries']}
    photos = {}
    for path in catalogs:
        data = json.loads((ROOT / path).read_text())
        for beer in data.get('catalog', data)['beers']:
            if beer.get('image'):
                photos.setdefault(beer['image'], beer)
    generated = reused = 0
    for source, beer in photos.items():
        raw = local(source).read_bytes()
        digest = sha(raw)
        old = entries.get(source)
        if old and old['sourceSha256'] == digest:
            target = local(old['thumbnail'])
            if target.is_file() and 0 < target.stat().st_size <= LIMIT and sha(target.read_bytes()) == old['thumbnailSha256']:
                reused += 1
                continue
        # Resize the approved displayed photo, not the unrelated original-shot
        # fallback. Preserve full framing and alpha for content-bound metadata.
        with Image.open(io.BytesIO(raw)) as opened:
            original = ImageOps.exif_transpose(opened).convert('RGBA')
        output = None
        for edge in [192, 160, 128, 96]:
            small = original.copy()
            small.thumbnail((edge, edge), Image.Resampling.LANCZOS)
            for quality in [82, 74, 66, 58, 48]:
                stream = io.BytesIO()
                small.save(stream, 'WEBP', quality=quality, method=6, exact=True)
                candidate = stream.getvalue()
                if len(candidate) <= LIMIT:
                    output = candidate
                    break
            if output is not None:
                break
        if output is None:
            raise RuntimeError(f'Cannot meet 10KB map budget: {source}')
        target_path = f'/images/map-thumbnails/{digest[:24]}.webp'
        target = local(target_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(output)
        entries[source] = {'sourcePath': source, 'sourceSha256': digest,
            'thumbnail': target_path, 'thumbnailSha256': sha(output), 'bytes': len(output),
            'width': small.width, 'height': small.height, 'quality': quality,
            'alphaPreserved': True, 'method': 'Resize approved display image; preserve framing and transparency; original unchanged'}
        generated += 1
    payload = {'version': 1, 'maximumBytes': LIMIT, 'maximumEdge': 192,
        'entries': sorted(entries.values(), key=lambda row: row['sourcePath'])}
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    temporary = REGISTRY.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(REGISTRY)
    print(json.dumps({'sources': len(photos), 'generated': generated, 'reused': reused,
        'maximumBytes': max((entry['bytes'] for entry in entries.values()), default=0),
        'registry': str(REGISTRY)}))

if __name__ == '__main__':
    main()
