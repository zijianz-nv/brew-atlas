"""Offline evidence and local image checks; no network and no production writes."""
import pathlib,json,hashlib,xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
R=pathlib.Path(__file__).resolve().parents[1];P=R/'public';O=R/'research/award-country-expansion-2026-10-02'
def read(p):return json.load(open(p))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
base=read(P/'data/curated.json');original={b['id']:b for b in base['beers'] if b.get('awards')};brs={b['id']:b for b in base['breweries']};merged=dict(original);checks=[]
for fn in ['award-supplements.json','country-expansion.json','siberia-expansion.json']:
 d=read(P/'data'/fn);assert len({b['id'] for b in d['beers']})==len(d['beers']);by={b['id']:b for b in d['breweries']}
 for b in d['beers']:
  if fn=='award-supplements.json':
   assert b['id'] in original;assert b['awards']==original[b['id']]['awards'];assert b['untappdId']==original[b['id']]['untappdId'];assert b['name']==original[b['id']]['name'];merged[b['id']]={**original[b['id']],**b}
  assert b['breweryId'] in by
  if not b.get('image'):continue
  assert b.get('imageKind')=='product_packshot';assert b['image']!=b.get('labelImage');assert b.get('description');assert by[b['breweryId']].get('locationVerified')
  for field in ['image','imageOriginal','imageThumbnail']:
   path=P/b[field].lstrip('/');assert path.is_file();im=Image.open(path);im.verify()
  im=Image.open(P/b['image'].lstrip('/'));box=b.get('imageContentBounds');assert box;assert (box['width'],box['height'])==im.size;rect=box['bounds'];assert min(rect.values())>=0;assert rect['x']+rect['width']<=im.width and rect['y']+rect['height']<=im.height
  ev=b.get('imageEvidence',{});expected=ev.get('sha256');assert not expected or sha(P/b['image'].lstrip('/'))==expected
  if ev.get('originalRGBunchanged') and b.get('sourceImage'):
   src=Image.open(P/b['sourceImage'].lstrip('/')).convert('RGB');full=Image.open(P/b['imageOriginal'].lstrip('/')).convert('RGB');assert np.array_equal(np.asarray(src),np.asarray(full)),b['id']
  # Newly generated thumbs have a declared bounded size; prior cached local matches retain their own bounds.
  if ev.get('derivative'):assert max(im.size)<=800;assert max(Image.open(P/b['imageThumbnail'].lstrip('/')).size)<=320
 for br in d['breweries']:
  if not br.get('locationVerified'):continue
  assert isinstance(br.get('lat'),(int,float)) and isinstance(br.get('lng'),(int,float));assert -90<=br['lat']<=90 and -180<=br['lng']<=180
  ev=br.get('locationEvidence',{});f=ev.get('coordinateEvidenceFile')
  if f and f.endswith('.xml'):
   node=ET.parse(R/f).getroot().find('node');assert float(node.attrib['lat'])==br['lat'];assert float(node.attrib['lon'])==br['lng'];assert str(ev.get('coordinateSourcePageId'))==node.attrib['id']
  if f:assert (R/f).is_file()
  if ev.get('identityEvidenceFile'):assert (R/ev['identityEvidenceFile']).is_file()
 brs.update(by);checks.append({'file':fn,'records':len(d['beers']),'photos':sum(bool(b.get('image')) for b in d['beers']),'breweries':len(by),'status':'passed'})
rows=[]
for b in merged.values():
 br=brs[b['breweryId']];image=bool(b.get('image'));intro=bool((b.get('description') or '').strip());location=bool(br.get('locationVerified'));missing=[]
 if not image:missing.append('no_reviewed_complete_bottle_or_can_photo')
 if not intro:missing.append('no_product_description_or_verified_product_specification')
 if not location:missing.append('brewery_city_reference_not_yet_verified')
 if b['untappdId']=='6490375':missing.append('public_page_product_sku_mismatch_rejected')
 rows.append({'id':b['id'],'untappdId':b['untappdId'],'name':b['name'],'brewery':br['name'],'country':br['country'],'image':image,'description':intro,'location':location,'mapReady':image and intro and location,'missing':missing})
summary={'total':len(rows),'withImage':sum(r['image'] for r in rows),'withIntroduction':sum(r['description'] for r in rows),'withLocation':sum(r['location'] for r in rows),'mapReady':sum(r['mapReady'] for r in rows)}
out={'createdAt':'2026-10-02','scope':'Local 119 resolved Untappd award IDs; NOT the complete global awards directory','checks':checks,'before':read(O/'baseline.json')['awards'],'after':summary,'remaining':{'photos':sum(not r['image'] for r in rows),'introductions':sum(not r['description'] for r in rows),'locations':sum(not r['location'] for r in rows)},'rows':rows};(O/'final-data-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'checks':checks,'after':summary,'remaining':out['remaining']},ensure_ascii=False))
