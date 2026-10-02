import pathlib,json,urllib.request,urllib.error,hashlib,time
from PIL import Image,ImageDraw
R=pathlib.Path(__file__).resolve().parents[1];data=json.load(open(R/'research/award-country-expansion-2026-10-02/untappd-public-products.json'));dest=R/'public/images/award-labels';dest.mkdir(exist_ok=True);rows=[]
for r in data['records']:
 u=r.get('labelUrl') or ''
 if '/beer_logos' not in u or 'beer-'+r['untappdId']+'_' not in u:continue
 p=dest/(r['untappdId']+pathlib.Path(u).suffix)
 try:
  if not p.exists():
   a=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=20);p.write_bytes(a.read());time.sleep(1)
  im=Image.open(p);rows.append({'id':r['untappdId'],'url':u,'path':'/'+str(p.relative_to(R/'public')),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'width':im.width,'height':im.height})
 except Exception as e:
  print(r['untappdId'],e,flush=True)
  if isinstance(e,urllib.error.HTTPError) and e.code in (401,403,429):break
(R/'research/award-country-expansion-2026-10-02/label-cache.json').write_text(json.dumps({'records':rows},indent=2))
for base in range(0,len(rows),40):
 chunk=rows[base:base+40];sheet=Image.new('RGB',(1000,((len(chunk)+7)//8)*150),'#e8e8e8');draw=ImageDraw.Draw(sheet)
 for i,r in enumerate(chunk):
  im=Image.open(R/'public'/r['path'].lstrip('/')).convert('RGBA');im.thumbnail((120,125));x=(i%8)*125;y=(i//8)*150;sheet.paste(im,(x+(125-im.width)//2,y),im);draw.text((x+5,y+130),r['id'],fill='black')
 sheet.save(R/f'.runtime/award-country-evidence/labels-{base//40}.jpg')
print('cached',len(rows))
