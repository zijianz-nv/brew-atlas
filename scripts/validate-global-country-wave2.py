"""Focused offline integrity checks for the final 19-product country batch."""
import pathlib,json,hashlib,xml.etree.ElementTree as ET
from PIL import Image
import numpy as np
R=pathlib.Path(__file__).resolve().parents[1];P=R/'public';O=R/'research/global-country-wave2-2026-10-02';d=json.load(open(P/'data/global-country-wave2.json'));br={x['id']:x for x in d['breweries']};old=json.load(open(O/'existing-input.json'));oldb={x['id']:x for x in old['beers']};oldbr={x['id']:x for x in old['breweries']};checks=[]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert len(d['beers'])==19 and len({x['id'] for x in d['beers']})==19 and len(br)==10
assert len({br[x['breweryId']]['country'] for x in d['beers']})==10
assert sum(x['id'] in oldb for x in d['beers'])==6
for b in d['beers']:
 assert b['description'] and b['imageKind']=='product_packshot' if 'imageKind' in b else b['description'] and b['image']
 r=br[b['breweryId']];assert r['locationVerified'] and isinstance(r['lat'],(int,float)) and isinstance(r['lng'],(int,float))
 e=b['descriptionEvidence'];assert sha(R/e['sourceFile'])==e['sourceSha256']
 if b['id'] in oldb:
  before=oldb[b['id']];assert [b.get(k) for k in ['id','name','breweryId','abv','ibu','image']]==[before.get(k) for k in ['id','name','breweryId','abv','ibu','image']];assert not before.get('description')
  assert (r['lat'],r['lng'])==(oldbr[r['id']]['lat'],oldbr[r['id']]['lng'])
 else:
  e=b['imageEvidence'];assert sha(P/e['sourceImage'].lstrip('/'))==e['sourceSha256'];assert sha(P/b['image'].lstrip('/'))==e['sha256'];assert sha(P/b['imageOriginal'].lstrip('/'))==e['fullSha256']
  # Original transparent packshots were not re-painted or changed at all.
  assert np.array_equal(np.asarray(Image.open(P/e['sourceImage'].lstrip('/')).convert('RGBA')),np.asarray(Image.open(P/b['imageOriginal'].lstrip('/')).convert('RGBA')))
 for key,maximum in [('image',800),('imageThumbnail',400)]:
  im=Image.open(P/b[key].lstrip('/')).convert('RGBA');assert im.getchannel('A').getextrema()==(0,255);assert max(im.size)<=maximum
 cb=b['imageContentBounds'];im=Image.open(P/b['image'].lstrip('/'));assert (cb['width'],cb['height'])==im.size;q=cb['bounds'];assert q['x']>=0 and q['y']>=0 and q['width']>0 and q['height']>0 and q['x']+q['width']<=im.width and q['y']+q['height']<=im.height
 checks.append({'id':b['id'],'country':r['country'],'image':b['image'],'sha256':sha(P/b['image'].lstrip('/')),'descriptionEvidenceVerified':True,'originalIdentityRetained':b['id'] in oldb})
for r in br.values():
 if r['id'] in oldbr:continue
 e=r['locationEvidence'];p=R/e['coordinateEvidenceFile'];assert sha(p)==e['coordinateSha256'];assert sha(R/e['identityEvidenceFile'])==e['identitySha256']
 if e.get('coordinateProvider')=='OpenStreetMap':
  n=ET.parse(p).getroot().find('node');assert n.attrib['id']==str(e['coordinateSourcePageId']);assert r['locationPrecision']=='locality_landmark';lat,lon=float(n.attrib['lat']),float(n.attrib['lon'])
 else:
  n=json.load(open(p))['query']['pages'][str(e['coordinateSourcePageId'])];assert n['title']==e['coordinatePlaceTitle'];lat,lon=n['coordinates'][0]['lat'],n['coordinates'][0]['lon']
 assert (r['lat'],r['lng'])==(lat,lon)
result={'status':'passed','validatedAt':'2026-10-02','records':19,'newOriginalPackshotsUnchanged':13,'existingExactRecordsEnriched':6,'breweries':10,'countries':10,'rows':checks};(O/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print('PASS: 19 records / 10 countries; 13 original RGBA identical, six original IDs/scalars/images preserved, source and coordinate hashes checked')
