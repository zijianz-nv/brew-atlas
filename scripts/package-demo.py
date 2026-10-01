#!/usr/bin/env python3
"""Package the already built Mac demo, including original data/image notices."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT.parent / 'BrewAtlas-Mac-Demo.zip'
required = ['dist/index.html', '启动精酿地球.command', '停止精酿地球.command',
            'scripts/serve.mjs', 'README.md', 'THIRD-PARTY-NOTICES.md',
            'research/DELIVERY.md', 'research/TAXONOMY.md', 'qa/v15-results.json',
            'qa/scale-readiness.json']
for name in required:
    assert (ROOT / name).is_file(), name
qa = json.loads((ROOT / 'qa/v15-results.json').read_text())
assert isinstance(qa.get('results'), list) and qa['results'] and all(r.get('passed') is True for r in qa['results']), 'Version 1.5 browser checks must pass'
assert qa.get('errors') == [] and qa.get('external') == [], 'Version 1.5 checks must have no browser errors or external requests'
files = {ROOT / p for p in required}
for directory in ['dist', 'research']:
    files.update(p for p in (ROOT / directory).rglob('*') if p.is_file())
files.update(p for p in (ROOT / 'qa').glob('v15-*.png') if p.is_file() and 'failure' not in p.name)
temp = DEST.with_suffix('.tmp.zip')
with zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
    for file in sorted(files):
        archive.write(file, Path('BrewAtlas-Mac-Demo') / file.relative_to(ROOT))
with zipfile.ZipFile(temp) as archive:
    assert archive.testzip() is None
    assert archive.getinfo('BrewAtlas-Mac-Demo/启动精酿地球.command').external_attr >> 16 & 0o111
temp.replace(DEST)
digest = hashlib.sha256(DEST.read_bytes()).hexdigest()
DEST.with_suffix('.sha256').write_text(f'{digest}  {DEST.name}\n')
print(json.dumps({'archive': str(DEST), 'files': len(files), 'bytes': DEST.stat().st_size,
                  'sha256': digest, 'integrity': 'passed'}, ensure_ascii=False, indent=2))
