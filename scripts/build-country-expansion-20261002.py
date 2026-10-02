"""Build four documented missing-country products; white-background removal changes alpha only."""
import pathlib,json,hashlib,urllib.parse
import numpy as np
from PIL import Image
R=pathlib.Path(__file__).resolve().parents[1];E=R/'.runtime/award-country-evidence';P=R/'public';O=R/'research/award-country-expansion-2026-10-02'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def framing(im,p):
 a=np.asarray(im.convert('RGBA'))[:,:,3];ys,xs=np.where(a>=64);pad=max(1,round(im.height*.01));x0=max(0,int(xs.min())-pad);y0=max(0,int(ys.min())-pad);x1=min(im.width,int(xs.max())+pad+1);y1=min(im.height,int(ys.max())+pad+1)
 return {'width':im.width,'height':im.height,'bounds':{'x':x0,'y':y0,'width':x1-x0,'height':y1-y0},'originalSha256':sha(p),'method':'decoded_alpha_body_with_padding','alphaThreshold':64,'paddingPixels':pad}
def derive(name,source,roi=None):
 raw=P/source.lstrip('/');im=Image.open(raw).convert('RGBA');method='original_transparent_packshot';params={}
 if roi:
  arr=np.array(im);alpha=np.zeros(arr.shape[:2],dtype=np.uint8);x0,y0,x1,y1=roi
  # Row outer-envelope preserves all RGB/white label interior. Only the empty white canvas is transparent.
  for y in range(y0,y1):
   xs=np.where(np.min(arr[y,x0:x1,:3],axis=1)<247)[0]
   if len(xs)>2:alpha[y,x0+max(0,int(xs.min())-1):x0+min(x1-x0,int(xs.max())+2)]=255

  if name=='musa-born':
   alpha[1250:,:389]=0;alpha[1250:,699:]=0;alpha[1267:,:]=0
  arr[:,:,3]=alpha;im=Image.fromarray(arr);method='local_python_alpha_only_row_outer_envelope';params={'roi':roi,'whiteThreshold':247,'edgePad':1,'RGBUnchanged':True,'note':'Manually restricted to exact single bottle; label interior remains opaque.'}
  full=P/f'images/country-expansion/{name}-cutout.png';im.save(full)
 else:full=raw
 assert np.array_equal(np.asarray(Image.open(raw).convert('RGB')),np.asarray(im.convert('RGB')))
 card=im.copy();card.thumbnail((800,800),Image.Resampling.LANCZOS);cp=P/f'images/country-expansion/{name}-card.webp';card.save(cp,format='WEBP',lossless=True)
 thumb=im.copy();thumb.thumbnail((320,320),Image.Resampling.LANCZOS);tp=P/f'images/country-expansion/{name}-map.webp';thumb.save(tp,format='WEBP',lossless=True)
 return {'image':'/'+str(cp.relative_to(P)),'imageThumbnail':'/'+str(tp.relative_to(P)),'imageOriginal':'/'+str(full.relative_to(P)),'sourceImage':source,'imageContentBounds':framing(card,cp),'imageEvidence':{'sha256':sha(cp),'originalSha256':sha(raw),'fullSha256':sha(full),'method':method,'parameters':params,'originalRGBunchanged':True,'retrievedAt':'2026-10-02','individuallyVerified':True,'visualReview':'完整单瓶品牌和酒名已目视核验；原图保留，仅背景alpha分离，不重画标签。','derivative':{'mapMax':320,'cardMax':800,'format':'lossless_webp'}}}
coords={v['title']:v for v in json.load(open(E/'coordinates.json'))['query']['pages'].values()}
items=[
 {'slug':'musa-born','brewery':'Cerveja Musa','country':'Portugal','countryZh':'葡萄牙','code':'PT','city':'Lisbon','cityZh':'里斯本','cityAliases':['Lisboa'],'name':'Born in the IPA','style':'India Pale Ale','abv':6.5,'ibu':70,'description':'Musa 的印度淡色艾尔，呈略浑浊的橙色。酒厂描述其苦味平衡，并带有葡萄柚、芒果与蜜瓜香气。','page':'https://cervejamusa.com/en/products/born-in-the-ipa','pagefile':'musa.html','identity':'https://cervejamusa.com/pages/a-musa','identityfile':'musa-location.html','source':'/images/country-expansion/musa-born.jpg','roi':[320,78,744,1277]},
 {'slug':'casa-fula','brewery':'Casa Bruja Brewing Co.','country':'Panama','countryZh':'巴拿马','code':'PA','city':'Panama City','cityZh':'巴拿马城','cityAliases':['Ciudad de Panamá','Panamá'],'name':'Fula','style':'Blonde Ale','abv':4.7,'ibu':14,'description':'Casa Bruja 的金色艾尔，以 Pale 和 Pilsner 麦芽酿造。酒厂描述其酒体柔和、味道均衡，酵母带来轻微果香。','page':'https://casabruja.com/cervezas/fula/','pagefile':'casabruja.html','identity':'https://casabruja.com/cervezas/fula/','identityfile':'casabruja.html','source':'/images/country-expansion/casa-fula.jpg','roi':[155,13,291,420]},
 {'slug':'colonel-lager','brewery':'Colonel Brewery & Distillery','country':'Lebanon','countryZh':'黎巴嫩','code':'LB','city':'Batroun','cityZh':'拜特龙','cityAliases':['البترون'],'name':'Colonel Lager','style':'Lager','abv':None,'ibu':None,'description':'来自黎巴嫩拜特龙的 Colonel 拉格，官网介绍采用捷克拉格传统。公开页面的酒精度范围表述不清，本次保留空值，不将麦汁浓度当成酒精度。','page':'https://colonelbnd.com/','pagefile':'colonel.html','identity':'https://colonelbnd.com/','identityfile':'colonel.html','source':'/images/country-expansion/colonel-lager.png','roi':None},
 {'slug':'dargett-pale','brewery':'Dargett Brewery','country':'Armenia','countryZh':'亚美尼亚','code':'AM','city':'Yerevan','cityZh':'埃里温','cityAliases':['Երևան','Ереван'],'name':'Pale Ale (Coney Island)','style':'American Pale Ale','abv':5.5,'ibu':40,'description':'Dargett 的淡色艾尔，瓶身列明 5.5% 酒精度与 40 IBU。亚美尼亚零售目录描述它带有热带水果香气，苦味柔和而平衡。','page':'https://www.sas.am/en/catalog/armyanskoe/135536/','pagefile':'dargett-sas.html','identity':'https://visitarmenia.travel/en/entertainment/257','identityfile':'dargett-location.html','source':'/images/country-expansion/dargett-pale.png','roi':[440,65,758,1137]}
]
images={x['name']:x for x in json.load(open(O/'country-image-access.json'))};beers=[];brs=[]
for x in items:
 geo=coords[x['city']];c=geo['coordinates'][0];bid='country-expansion-'+x['slug'];loc='https://en.wikipedia.org/wiki/'+urllib.parse.quote(x['city'].replace(' ','_'));br={'id':bid+'-brewery','name':x['brewery'],'country':x['country'],'countryZh':x['countryZh'],'countryCode':x['code'],'countryBasis':'public_brewery_identity','city':x['city'],'cityZh':x['cityZh'],'cityAliases':x['cityAliases'],'lat':c['lat'],'lng':c['lon'],'locationVerified':True,'locationPrecision':'city','locationRole':'brewpub_city_reference' if x['code']=='AM' else 'brewery_city_reference','locationSourceUrl':x['identity'],'coordinateSourceUrl':loc,'coordinateSourcePageId':geo['pageid'],'locationEvidence':{'identitySourceUrl':x['identity'],'identityEvidenceFile':str((E/x['identityfile']).relative_to(R)),'identitySha256':sha(E/x['identityfile']),'coordinateSourceUrl':loc,'coordinateEvidenceFile':str((E/'coordinates.json').relative_to(R)),'coordinateSourcePageId':geo['pageid'],'coordinatePlaceTitle':geo['title'],'coordinateSha256':sha(E/'coordinates.json'),'verifiedAt':'2026-10-02','precisionNote':'城市参考坐标，不是逐款生产或厂房位置。'+('Dargett采用埃里温官方旅游目录所列72 Arami brewpub参考，瓶装生产厂不保证同址。' if x['code']=='AM' else '')},'sourceUrls':[x['identity'],loc],'collection':'regional','collections':['regional']}
 brs.append(br);b={'id':bid,'name':x['name'],'breweryId':br['id'],'collection':'regional','collections':['regional'],'style':x['style'],'abv':x['abv'],'ibu':x['ibu'],'description':x['description'],'originalDescription':None,'flavors':[],'hops':[],'malts':[],'rating':None,'ratingsCount':None,'awards':[],'imageKind':'product_packshot','sourceUrls':[x['page'],images[x['slug']]['url']],'sourceNote':'按缺少可展示瓶图的国家补充真实产品。公开商品原图保留，展示衍生图仅本地确定性alpha分离和等比缩小；无独立精酿/销量排名推断。','descriptionEvidence':{'sourceUrl':x['page'],'sourceFile':str((E/x['pagefile']).relative_to(R)),'sourceSha256':sha(E/x['pagefile']),'retrievedAt':'2026-10-02','method':'faithful_short_summary_of_public_product_information'}}
 b.update(derive(x['slug'],x['source'],x['roi']));b.update(imageSource=x['page'],imageDownloadUrl=images[x['slug']]['url'],imageCredit=x['brewery']+(' / SAS retail product catalogue' if x['code']=='AM' else ' official product catalogue'),imageLicense='Copyright holder; no open image licence stated');b['imageEvidence'].update(sourceUrl=x['page'],downloadUrl=images[x['slug']]['url']);beers.append(b)
(P/'data/country-expansion.json').write_text(json.dumps({'metadata':{'createdAt':'2026-10-02','method':'reviewed_public_product_pages','countries':['PT','PA','LB','AM'],'locationPrecision':'city reference, not exact production facility','status':'ready'},'breweries':brs,'beers':beers},ensure_ascii=False,indent=2)+'\n');print('country_expansion',len(beers),'products',len(brs),'locations')
