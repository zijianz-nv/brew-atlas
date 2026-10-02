"""Merge exact public Untappd facts with individually reviewed bottle/can assets. Offline/reproducible."""
import pathlib,json,re,copy,hashlib,unicodedata
import numpy as np
from PIL import Image
R=pathlib.Path(__file__).resolve().parents[1];P=R/'public';O=R/'research/award-country-expansion-2026-10-02';E=R/'.runtime/award-country-evidence'
def read(p):return json.load(open(p))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def norm(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s.lower()))
D=read(P/'data/curated.json');by={b['id']:b for b in D['breweries']};aw={str(b['untappdId']):copy.deepcopy(b) for b in D['beers'] if b.get('untappdId') and b.get('awards')};base=read(O/'local-packshot-supplements.json');out={str(b['untappdId']):b for b in base['beers']};brs={b['id']:b for b in base['breweries']};facts=read(O/'untappd-public-products.json')['records'];labels={r['id']:r for r in read(O/'label-cache.json')['records']};locs=read(O/'local-brewery-locations.json');conflicts=[]
for f in facts:
 uid=f['untappdId'];b=out.get(uid,copy.deepcopy(aw[uid]));br=brs.get(b['breweryId'],copy.deepcopy(by[b['breweryId']]))
 evidence={'sourceUrl':f['sourceUrl'],'sourceFile':f['sourceFile'],'sourceSha256':f['sourceSha256'],'retrievedAt':f['retrievedAt'],'identityField':'Product.sku','identityValue':uid,'method':'anonymous_public_html_product_JSONLD_and_header','doesNotIncludeUserReviews':True}
 b['sourceUrls']=list(dict.fromkeys(b.get('sourceUrls',[])+[f['sourceUrl']]))
 if f.get('description') and not b.get('description'):
  excerpt=' '.join(f['description'].split()[:25]);b['originalDescription']=excerpt;b['description']=excerpt+('…' if len(f['description'].split())>25 else '');b['descriptionEvidence']={**evidence,'sourceField':'Product.description','excerptWordLimit':25};b['descriptionBasis']='public_product_description_excerpt'
 for field in ['abv','ibu','rating','ratingsCount']:
  value=f.get(field)
  if uid=='2133633' and field=='abv':continue
  if value is not None:
   if b.get(field) is None:b[field]=value
   elif b[field]!=value:conflicts.append({'id':uid,'field':field,'retainedValue':b[field],'publicValue':value,'publicSource':f['sourceUrl'],'resolution':'existing_field_retained'})
 b['publicProductEvidence']=evidence;b['identityEvidence']={**b.get('identityEvidence',{}),'status':'reviewed_same_product','untappdId':uid,'sourceUrl':f['sourceUrl'],'basis':'Exact Product.sku/MPN agrees with the previously resolved award drink ID. Header names retained as evidence.','publicName':f['name'],'publicBrewery':f['brewery']}
 if uid in labels and uid not in ['1816194','4888960','4980827','6083437']:
  l=labels[uid];b.update(labelImage=l['path'],labelImageOriginal=l['path'],labelImageSource=l['url'],labelEvidence={'sourceUrl':f['sourceUrl'],'sha256':l['sha256'],'width':l['width'],'height':l['height'],'role':'public_product_page_label','mapImage':False,'note':'A catalogue label is not a bottle/can photo; never copied into image unless separately visually reviewed as a package.'})
 if not br.get('locationVerified') and b['breweryId'] in locs:
  matches=locs[b['breweryId']]['candidateLocations'];m=next((x for x in matches if x.get('countryCode')==br.get('countryCode') or x.get('country')==br.get('country')),None)
  if m:
   for k in ['city','region','lat','lng','locationPrecision','locationRole','locationEvidence','coordinateSourceUrl','coordinateSourcePageId','locationSourceUrl','website','locationVerified']:
    if m.get(k) is not None:br[k]=copy.deepcopy(m[k])
   br['sourceUrls']=list(dict.fromkeys(br.get('sourceUrls',[])+m.get('sourceUrls',[])));br['locationMatchedFrom']=m['id'];br['locationNote']='同名同国家的已核酒厂城市参考位置；非逐款实际酿造设施。'
 brs[br['id']]=br;out[uid]=b

def bounds(im,p):
 a=np.array(im.convert('RGBA'))[:,:,3];ys,xs=np.where(a>=64);pad=max(1,round(im.height*.01));box=[max(0,int(xs.min())-pad),max(0,int(ys.min())-pad),min(im.width,int(xs.max())+1+pad),min(im.height,int(ys.max())+1+pad)];return {'width':im.width,'height':im.height,'bounds':{'x':box[0],'y':box[1],'width':box[2]-box[0],'height':box[3]-box[1]},'originalSha256':sha(p),'method':'decoded_alpha_body_with_padding','alphaThreshold':64}
def package(uid,source,sourceUrl,downloadUrl,roi=None,cutBottom=None):
 b=out[uid];raw=P/source.lstrip('/');im=Image.open(raw).convert('RGBA');arr=np.array(im);method='original_transparent_packshot'
 if roi:
  a=np.zeros(arr.shape[:2],dtype=np.uint8);x0,y0,x1,y1=roi
  for y in range(y0,y1):
   xs=np.where(np.min(arr[y,x0:x1,:3],axis=1)<247)[0]
   if len(xs)>2:a[y,x0+max(0,int(xs.min())-1):x0+min(x1-x0,int(xs.max())+2)]=255
  arr[:,:,3]=a;method='local_python_alpha_only_reviewed_package_outline'
 if cutBottom:arr[cutBottom:,:,3]=0;method='local_python_alpha_only_remove_reflection_below_can'
 im=Image.fromarray(arr);assert np.array_equal(np.array(Image.open(raw).convert('RGB')),arr[:,:,:3]);full=P/f'images/award-supplements/{uid}-cutout.png';im.save(full);card=im.copy();card.thumbnail((800,800),Image.Resampling.LANCZOS);cp=P/f'images/award-supplements/{uid}-card.webp';card.save(cp,format='WEBP',lossless=True);thumb=im.copy();thumb.thumbnail((320,320),Image.Resampling.LANCZOS);tp=P/f'images/award-supplements/{uid}-map.webp';thumb.save(tp,format='WEBP',lossless=True)
 b.update(image='/'+str(cp.relative_to(P)),imageOriginal='/'+str(full.relative_to(P)),imageThumbnail='/'+str(tp.relative_to(P)),imageKind='product_packshot',imageSource=sourceUrl,imageDownloadUrl=downloadUrl,imageCredit='Public brewery/product page; source attribution retained',imageContentBounds=bounds(card,cp),imageLicense='Copyright holder; no open image licence stated',sourceImage=source)
 b['imageEvidence']={'sourceUrl':sourceUrl,'downloadUrl':downloadUrl,'sourceImage':source,'sourceSha256':sha(raw),'sha256':sha(cp),'fullSha256':sha(full),'originalRGBunchanged':True,'method':method,'parameters':{'roi':roi,'cutBottom':cutBottom},'reviewedAt':'2026-10-02','individuallyVerified':True,'visualReview':'Exact product name and manufacturer on complete bottle/can visually reviewed. Alpha-only display derivative, no regenerated labels.','derivative':{'cardMax':800,'mapMax':320,'format':'lossless_webp'}}
 b['sourceUrls']=list(dict.fromkeys(b.get('sourceUrls',[])+[sourceUrl,downloadUrl]))
package('1682299','/images/award-supplements/behemoth-triple.png','https://shop.behemothbrewing.co.nz/products/triple-chocolate-milk-stout-440mlcan-caseof12','https://shop.behemothbrewing.co.nz/cdn/shop/files/Triple-Chocolate---Milk-Stout-440-Printed-Can_1200x1200.png?v=1762913992',cutBottom=1121)
out['1682299']['description']='这款牛奶世涛使用巧克力麦芽、荷兰可可粉、可可碎与香草，官网现行罐装为5.5%酒精度、440mL。';out['1682299']['descriptionBasis']='official_current_product_and_public_exact_id_description';out['1682299']['abv']=5.5;out['1682299']['sourceNote']+=' 当前官网罐装5.5%；旧官网介绍曾列6.5%，未将旧版25IBU强并到现行包装。';out['1682299']['sourceConflicts']=[{'field':'abv','currentShop':5.5,'olderOfficialPage':6.5,'resolution':'current_shop_packaging','sourceUrl':'https://www.behemothbrewing.co.nz/beer/triple-chocolate'}]
package('23963','/images/award-supplements/picaroons-winter.png','https://picaroons.ca/our-beer/winter-warmer/','https://picaroons.ca/wp-content/uploads/2021/06/winter-warmer.png');out['23963']['abv']=7.5;out['23963']['ibu']=25
for uid,roi in [('1814409',[172,36,343,452]),('1920224',[0,10,539,1032])]:
 l=labels[uid];f=next(x for x in facts if x['untappdId']==uid);package(uid,l['path'],f['sourceUrl'],l['url'],roi=roi)
 if uid=='1814409':out[uid]['description']='Foghorn 的 Old Forte 冬季浓色艾尔，本次包装明确标为7%酒精度、473mL罐装；公开酒款页列为 Winter Warmer，未据此推测配方。';out[uid]['descriptionBasis']='verified_product_packaging_and_public_specification';out[uid]['flavorDescriptionVerified']=False
# Both references are real town-level places, never brewery building coordinates.
geo=read(E/'alpine-coordinate.json')['entities']['Q1028044']['claims']['P625'][0]['mainsnak']['datavalue']['value']
for uid,city,lat,lng,url,ef,pid in [('1814409','Rothesay',45.380278,-65.968611,'https://geonames.nrcan.gc.ca/search-place-names/unique?id=DACOY','rothesay-coordinate-web.json','DACOY'),('1920224','Alpine',geo['latitude'],geo['longitude'],'https://www.wikidata.org/wiki/Q1028044','alpine-coordinate.json','Q1028044')]:
 b=out[uid];br=brs[b['breweryId']];f=next(x for x in facts if x['untappdId']==uid);br.update(city=city,lat=lat,lng=lng,locationVerified=True,locationPrecision='city',locationRole='brewery_city_reference',locationSourceUrl=f['breweryUrl'],coordinateSourceUrl=url,coordinateSourcePageId=pid,locationNote='公开酒厂profile给出城市和地址，地理来源给出同名市镇参考点；非精确厂址。');br['locationEvidence']={'identitySourceUrl':f['breweryUrl'],'identityEvidenceFile':str((E/f'brewery-{uid}.html').relative_to(R)),'identitySha256':sha(E/f'brewery-{uid}.html'),'coordinateSourceUrl':url,'coordinateEvidenceFile':str((E/ef).relative_to(R)),'coordinateSha256':sha(E/ef),'coordinateSourcePageId':pid,'coordinatePlaceTitle':city,'verifiedAt':'2026-10-02'};br['sourceUrls']=list(dict.fromkeys(br.get('sourceUrls',[])+[f['breweryUrl'],url]))
for path in [O/'agent-award-products.json',O/'agent-award-australia.json',O/'german-award-products.json']:
 if path.exists():
  d=read(path)
  for br in d.get('breweries',[]):brs[br['id']]={**brs.get(br['id'],{}),**br}
  for b in d.get('beers',[]):
   uid=str(b['untappdId']);old=out.get(uid,aw.get(uid,{}));merged={**old,**{k:v for k,v in b.items() if v is not None or old.get(k) is None}};merged['sourceUrls']=list(dict.fromkeys(old.get('sourceUrls',[])+b.get('sourceUrls',[])));out[uid]=merged
payload={'metadata':{'createdAt':'2026-10-02','method':'exact_untappd_product_ids_plus_reviewed_public_packaging','note':'Preserves original awards; labels are independent metadata and never promoted to map images without bottle/can inspection. Coordinates are city references.','publicProductRecords':len(facts),'globalProductRatingsAreNotAwardAnnualRatings':True,'status':'ready_incremental'},'breweries':list(brs.values()),'beers':list(out.values())};(P/'data/award-supplements.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n');(O/'field-conflicts.json').write_text(json.dumps(conflicts,ensure_ascii=False,indent=2)+'\n');print('supplement',len(out),'records',sum(bool(x.get('image')) for x in out.values()),'packshots',sum(bool(x.get('labelImage')) for x in out.values()),'labels',sum(bool(x.get('description')) for x in out.values()),'intros',sum(x.get('locationVerified',False) for x in brs.values()),'verified_breweries')
