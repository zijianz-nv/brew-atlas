"""Bounded anonymous public product-page audit. No accounts, reviews or private data."""
import json,re,hashlib,html,time,urllib.request,urllib.error,unicodedata,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'research/award-country-expansion-2026-10-02'; RAW=ROOT/'.runtime/award-country-evidence'
def slug(s):
 return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip('-')
def clean(s): return html.unescape(re.sub('<[^>]+>',' ',s)).strip()
def parse(s,uid):
 blocks=re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',s,re.S)
 p=next((x for b in blocks for x in [json.loads(b)] if isinstance(x,dict) and x.get('@type')=='Product'),None)
 if not p or str(p.get('sku'))!=uid:raise ValueError('exact product JSON-LD sku mismatch')
 header=s[s.find('class="box b_info"'):];header=header[:header.find('<div class="stats">')]
 name=re.search(r'<h1[^>]*>(.*?)</h1>',header,re.S)
 br=re.search(r'<p class="brewery">.*?<a href="([^"]+)">(.*?)</a>',header,re.S)
 label=re.search(r'data-image="([^"]+)"',header)
 if not label:label=re.search(r'<img src="([^"]+)"',header)
 def n(c):
  m=re.search(r'<p class="'+c+r'">\s*([0-9.]+)',s);return float(m.group(1)) if m else None
 return {'untappdId':uid,'name':clean(name.group(1)) if name else None,'brewery':clean(br.group(2)) if br else None,'breweryUrl':'https://untappd.com'+br.group(1) if br else None,'abv':n('abv'),'ibu':n('ibu'),'description':p.get('description') or None,'labelUrl':html.unescape(label.group(1)) if label else None,'rating':(p.get('aggregateRating') or {}).get('ratingValue'),'ratingsCount':(p.get('aggregateRating') or {}).get('reviewCount')}
def run():
 data=json.load(open(OUT/'baseline.json'));records=[];audit=[]
 for a in data['awardRows']:
  if a['image']:continue
  uid=a['untappdId'];url='https://untappd.com/b/'+slug(a['brewery']+' '+a['name'])+'/'+uid;dest=RAW/('untappd-'+uid+'.html')
  try:
   if dest.exists():raw=dest.read_bytes();status='cached'
   else:
    r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=25);raw=r.read();dest.write_bytes(raw);status=r.status;time.sleep(5)
   x=parse(raw.decode(),uid);x.update(sourceUrl=url,sourceFile=str(dest.relative_to(ROOT)),sourceSha256=hashlib.sha256(raw).hexdigest(),retrievedAt='2026-10-02');records.append(x);audit.append({'id':uid,'status':status,'bytes':len(raw)});print(uid,'OK',x['name'],bool(x['description']),x['labelUrl'],flush=True)
  except Exception as e:
   audit.append({'id':uid,'error':str(e)});print(uid,'ERROR',str(e),flush=True)
   if isinstance(e,urllib.error.HTTPError) and e.code in (401,403,429):break
  (OUT/'untappd-public-products.json').write_text(json.dumps({'records':records,'audit':audit},ensure_ascii=False,indent=2))
 (OUT/'untappd-public-products.json').write_text(json.dumps({'records':records,'audit':audit},ensure_ascii=False,indent=2))
if __name__=='__main__':run()
