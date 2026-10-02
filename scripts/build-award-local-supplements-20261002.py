import json,hashlib,pathlib,copy
from PIL import Image
R=pathlib.Path(__file__).resolve().parents[1];D=json.load(open(R/'public/data/catalog.json'));beers={x['id']:x for x in D['beers']};breweries={x['id']:x for x in D['breweries']};out=[];brs={}
for m in json.load(open(R/'research/award-country-expansion-2026-10-02/local-image-candidates.json')):
 b=copy.deepcopy(beers[m['awardId']]);c=beers[m['candidateId']];br=copy.deepcopy(breweries[b['breweryId']]);cb=breweries[c['breweryId']]
 if not br.get('locationVerified'):
  for k in ['lat','lng','city','region','locationPrecision','locationRole','locationEvidence','website','locationVerified']:
   if k in cb:br[k]=copy.deepcopy(cb[k])
  br['locationSourceUrl']=cb.get('locationEvidence',{}).get('identitySourceUrl');br['coordinateSourceUrl']=cb.get('locationEvidence',{}).get('coordinateSourceUrl');br['sourceUrls']=list(dict.fromkeys(br.get('sourceUrls',[])+cb.get('sourceUrls',[])));br['locationNote']='复用已核同一酒厂的城市参考坐标，非精确生产厂址。';br['locationMatchedFrom']=cb['id']
 for k in ['image','imageOriginal','imageThumbnail','imageDownloadUrl','imageLicense','imageLicenseUrl','imageCredit']:
  if c.get(k):b[k]=copy.deepcopy(c[k])
 p=R/'public'/b['image'].lstrip('/');im=Image.open(p).convert('RGBA');box=im.getchannel('A').getbbox();b['imageContentBounds']={'width':im.width,'height':im.height,'bounds':dict(zip(['x','y','width','height'],[box[0],box[1],box[2]-box[0],box[3]-box[1]])),'originalSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'method':'decoded_alpha_bbox'}
 b['imageKind']='product_packshot';b['imageEvidence']={**c.get('imageEvidence',{}),'individuallyVerified':True,'sameProductMatchedFrom':c['id'],'visualReview':'逐图核对完整包装品牌和酒名，非酒厂logo；旧包装不代表获奖年份的包装。','verifiedAt':'2026-10-02','sourceUrl':c['sourceUrls'][0]};b['sourceUrls']=list(dict.fromkeys(b['sourceUrls']+c['sourceUrls']));b['sourceNote']=(b.get('sourceNote') or '')+' 本轮按酒名、酒厂、国家及原始包装人工确认同款，复用本地公开目录图片；包装年份未经核实。'
 b['identityEvidence']={'status':'reviewed_same_product','matchedRecordId':c['id'],'basis':'same producer, exact product name and packaging visual inspection','reviewedAt':'2026-10-02'}
 if b['untappdId']=='2133633':
  b['description']='以越南咖啡酿造的帝国世涛。酒厂介绍称，配方灵感来自创办人在越南旅行时带回的咖啡；公开目录保留了早期瓶装版本。';b['abv']=None;b['ibu']=40;b['sourceUrls']+=['https://www.behemothbrewing.co.nz/beer/good-morning-vietnam','https://untappd.com/b/behemoth-brewing-company-good-morning-vietnam/2133633'];b['sourceNote']+=' 官方旧介绍列10% ABV，现行同ID产品/商店列8%；图为旧瓶装，本轮不选择单一ABV以免将不同配方版本混合。';b['sourceConflicts']=[{'field':'abv','officialArchive':10,'currentProduct':8,'resolution':'left_null','sourceUrls':['https://www.behemothbrewing.co.nz/beer/good-morning-vietnam','https://shop.behemothbrewing.co.nz/products/good-morning-vietnam-imperial-coffee-stout-12x440ml-8-abv']}]
 out.append(b);brs[br['id']]=br
p=R/'public/data/award-supplements.json';p.write_text(json.dumps({'metadata':{'createdAt':'2026-10-02','method':'reviewed_local_exact_product_matches','status':'first_batch','sourceReport':'research/award-country-expansion-2026-10-02/baseline.json'},'breweries':list(brs.values()),'beers':out},ensure_ascii=False,indent=2)+'\n');print(len(out),'beers',len(brs),'breweries')
