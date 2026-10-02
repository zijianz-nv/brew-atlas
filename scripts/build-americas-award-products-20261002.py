"""Exact award products from public catalogues, reviewed locally; originals retained."""
from pathlib import Path
import json,hashlib,copy,importlib.util,sys
import numpy as np
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1];out=R/'public/images/awards-americas';research=R/'research/award-country-expansion-2026-10-02/americas'
spec=importlib.util.spec_from_file_location('cutout_helpers',R/'scripts/cutout-existing-products.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
base=json.loads((R/'public/data/curated.json').read_text());by={b['id']:b for b in base['beers']};brs={b['id']:b for b in base['breweries']}
for b in json.loads((R/'public/data/award-supplements.json').read_text())['breweries']:
 if b.get('locationVerified'):brs[b['id']]=b
coords={p['title']:p for name in ['coordinates.json','extra-coordinates.json'] for p in json.loads((research/name).read_text())['query']['pages']}
configs=[
 dict(uid='5804095',url='https://melvinbrewing.com/',download='https://melvinbrewing.com/cms/uploads/images/661130283d3f7c5c42492de38431359e.png',source='melvin.html',description='官方标为西海岸皮尔森，包装强调酒花特点；采用酒厂目录中 Pils Boutique 红白配色罐装实物图。',abv=5,styleZh='西海岸皮尔森',factsUrl='https://www.melvinbrewing.com/beer-finder'),
 dict(uid='9259',url='https://www.molsoncoors.com/ca/brands/our-brands/granville-island-brewing?region=931',download='https://www.molsoncoors.com/ca/sites/molsonco/files/styles/beer_detail_180x/public/2022-09/Lions%20Winter%20Ale%20-%20granville.png?itok=f3-_4v3w',source='gib.html',description='Granville Island 的冬季艾尔。品牌官方描述焦糖、白巧克力与香草风味；图片采用品牌母公司目录中的同名罐装。',city='Vancouver',cityZh='温哥华',location='https://granvilleisland.com/directory/granville-island-brewing-co',abv=5.5,styleZh='冬季艾尔',role='brand_origin_city_reference'),
 dict(uid='4809541',url='https://cervezamanush.com.ar/cervezas/born-released-apa/',download='https://cervezamanush.com.ar/2020/wp-content/uploads/2020/09/2024-apa.jpg',source='manush.html',description='来自阿根廷巴里洛切的美式淡色艾尔。官方介绍包含柑橘、花香和松针香，酒体中等至中轻，口感柔和，收口偏干。官方名 Born & Released APA，对应相同酒厂、5.4% ABV、34 IBU 与 Citra/Cascade/Simcoe 酒花的获奖 APA。',city='Bariloche',cityZh='巴里洛切',location='https://cervezamanush.com.ar/fabrica/',abv=5.4,ibu=34,styleZh='美式淡色艾尔'),
 dict(uid='4757146',url='https://cervejariadogma.com.br/products/blanche-de-mooca',download=json.loads((research/'dogma.json').read_text())['product']['images'][0]['src'],source='dogma.json',description='向圣保罗 Mooca 街区致意的比利时风格小麦啤酒。酒厂介绍使用橙皮与芫荽籽，呈现柑橘和香料气息。',city='São Paulo',cityZh='圣保罗',location='https://cervejariadogma.com.br/products/blanche-de-mooca',abv=4.7,styleZh='比利时小麦啤酒')]
extra_urls=json.loads((research/'extra-image-urls.json').read_text())
configs.extend([
 dict(uid='1573915',url='https://boutique.tetedallumette.com/products/blanche-tete-et-les-sept-grains',download='https://cdn.shopify.com/s/files/1/0291/9687/7908/products/BlancheTete.png?v=1612960987',source='tete-shop.html',description='魁北克 Tête d’Allumette 的七谷白啤，官方介绍含印度香米。酒厂描述花香、香蕉和丁香气息，并带轻微咸鲜感；采用同名瓶装实物图。',city='Saint-André-de-Kamouraska',cityZh='圣安德烈-德卡穆拉斯卡',location='https://tetedallumette.com/',abv=7,styleZh='七谷小麦白啤'),
 dict(uid='231860',url='https://www.tresciudades.com.ar/shop/cerveza-capehorn-pilsen-botella-500ml-23974',download='https://www.tresciudades.com.ar/web/image/product.template/23974/image_1024?unique=3023f37',source='capehorn.html',description='阿根廷乌斯怀亚的 Cape Horn 皮尔森。零售商描述为金黄色酒液、白色泡沫，收口略带苦味；火地岛省生产部门资料确认其为当地获认证品牌。',city='Ushuaia',cityZh='乌斯怀亚',location='https://prodyambiente.tierradelfuego.gob.ar/fuegian-beverage-company-s-a-cerveza-beagle/',abv=5,styleZh='皮尔森',sourceRole='retailer_product_identity_and_packshot'),
 dict(uid='1816194',url='https://www.lcbo.com/en/anderson-brewing-winter-ale-46966',download='https://aem.lcbo.com/content/dam/lcbo/products/0/4/6/9/046966.jpg.thumb.319.319.png',source='anderson-lcbo.html',description='加拿大安大略省伦敦的 Anderson 冬季艾尔。LCBO 介绍有姜、肉桂与橙子的香气，以及太妃糖、蜂蜜和烤麦芽风味，收口带香料感；图中为 473ml、7% 罐装。',city='London, Ontario',cityZh='伦敦（安大略）',location='https://www.andersoncraftales.ca/',abv=7,styleZh='冬季艾尔',sourceRole='provincial_retailer_product_identity_and_packshot'),
 dict(uid='4044001',url='https://capitalpecado.com/soberbia/',download=extra_urls['4044001'],source='soberbia.html',description='墨西哥瓜达拉哈拉 Capital Pecado 的 SOBERBIA 帝国世涛，瓶身明确标注 Imperial Stout。官网同页的浅色小麦啤酒描述及 4.2% 参数与瓶身和获奖风格冲突，暂不采用这些口味、原料和酒精度数据。',city='Guadalajara',cityZh='瓜达拉哈拉',location='https://capitalpecado.com/soberbia/',abv=None,styleZh='帝国世涛'),
 dict(uid='6150444',url='https://www.valleybrewing.ca/woolly-winter-ale-info',download=extra_urls['6150444'],source='valley.html',description='加拿大德拉姆黑勒的冬季香料艾尔，深棕色、酒体轻至中等。官方列出姜、香草、肉桂与橙皮，描述烘烤、巧克力和坚果风味，收口略甜而略干。',city='Drumheller',cityZh='德拉姆黑勒',location='https://www.valleybrewing.ca/woolly-winter-ale-info',abv=5.6,ibu=20,styleZh='冬季香料艾尔')])

beers=[];breweries={};evidence=[];reviews=[]
for c in configs:
 uid=c['uid'];b=copy.deepcopy(by['curated-award-'+uid]);br=copy.deepcopy(brs[b['breweryId']]);src=out/(uid+'-source'+('.jpg' if uid=='4809541' else '.png'));orig=Image.open(src).convert('RGBA');rgba=orig.copy();method='original-retailer-transparent-packshot' if c.get('sourceRole') else 'original-official-transparent-packshot'
 if uid=='5804095':
  a=np.asarray(orig.getchannel('A'));spans=[]
  for y in range(orig.height):
   xs=np.flatnonzero(a[y]>=240)
   if len(xs):spans.append([y,float(xs[0])+.1,float(xs[-1])+.9])
  mask=np.asarray(h.mask_helper.make_mask(orig.size,spans),dtype='uint16');rgba.putalpha(Image.fromarray((a.astype('uint16')*mask//255).astype('uint8')));method='local-alpha-only-remove-official-soft-drop-shadow'
 if uid=='4757146':
  alpha=np.array(rgba.getchannel('A'));alpha[:,620:]=0;rgba.putalpha(Image.fromarray(alpha));method='local-alpha-only-extract-front-can-from-official-two-sided-photo'
 if uid=='4809541':
  arr=np.asarray(orig);spans=[]
  for y in range(155,796):
   xs=np.flatnonzero(arr[y,365:637,:3].min(axis=1)<235)+365
   if len(xs):spans.append([y,float(xs[0])+.3,float(xs[-1])+.7])
  spans += [[796,410,594],[800,418,589],[804,432,575],[807,451,555],[809,472,535],[811,499,505]]
  rgba.putalpha(h.mask_helper.make_mask(rgba.size,spans));method='local-alpha-only-reviewed-white-envelope-and-base'
 if uid in ['1573915','1816194','6150444']:
  spans={
   '1573915':[[56,211,225],[60,202,231],[72,198,232],[84,201,230],[108,199,230],[144,193,235],[183,182,244],[219,173,253],[254,169,257],[280,167,259],[353,168,258],[370,170,252],[381,177,245],[389,184,236],[393,200,226],[395,211,216]],
   '1816194':[[26,82,158],[28,76,164],[33,78,162],[40,73,167],[49,67,173],[58,66,174],[275,66,174],[284,71,169],[291,79,163],[295,90,152],[297,114,132]],
   '6150444':[[10,221,382],[15,197,405],[23,194,409],[29,193,408],[33,188,413],[44,184,417],[70,172,429],[103,166,434],[666,166,434],[682,176,424],[694,176,425],[704,179,422],[713,221,382]]
  }[uid]
  rgba.putalpha(h.mask_helper.make_mask(rgba.size,spans));method='local-alpha-only-reviewed-product-silhouette'
 full=out/(uid+'-cutout.png');card=out/(uid+'-card.webp');thumb=out/(uid+'-map.webp');rgba.save(full,compress_level=9);h.derivative(rgba,card,800);h.derivative(rgba,thumb,320)
 assert np.array_equal(np.asarray(Image.open(full))[:,:,:3],np.asarray(orig)[:,:,:3]);assert rgba.getchannel('A').getextrema()==(0,255)
 asset=lambda p:'/images/awards-americas/'+p.name
 sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
 b.update(image=asset(card),imageThumbnail=asset(thumb),imageOriginal=asset(full),imageBeforeCutout=asset(src),imageSource=c['url'],imageDownloadUrl=c['download'],imageCacheStatus='cached',imageKind='product_packshot',imageContentBounds=h.measure(card),description=c['description'],styleZh=c['styleZh'],abv=c['abv'])
 if 'ibu' in c:b['ibu']=c['ibu']
 b['sourceUrls']=list(dict.fromkeys(b.get('sourceUrls',[])+[c['url'],c.get('factsUrl',c['url'])]))
 b['imageEvidence']={'individuallyVerified':True,'verifiedAt':'2026-10-02','sourceUrl':c['url'],'sha256':sha(card),'originalSha256':sha(src),'derivative':True,'cacheStatus':'cached','identity':'Exact producer and product in cited public catalogue; packaging reference, award-year packaging unverified.'}
 b['imageDerivation']={'method':method,'sourceImage':asset(src),'fullResolutionCutout':asset(full),'rgbPixelsUnchanged':True,'sourceSha256':sha(src)}
 b['imageCredit']='Product image: '+br['name']+' via cited public product catalogue; cached for local research demo. No added reuse rights.'
 b['sourceEvidence']=b.get('sourceEvidence',[])+[{'url':c['url'],'role':c.get('sourceRole','official_product_identity_and_packshot'),'sourceFile':str((research/c['source']).relative_to(R)),'sha256':sha(research/c['source']),'retrievedAt':'2026-10-02'}]
 if c.get('city'):
  p=coords[c['city']];co=p['coordinates'][0];coordurl='https://en.wikipedia.org/wiki/'+c['city'].replace(' ','_')
  br.update(city=c['city'],cityZh=c['cityZh'],lat=co['lat'],lng=co['lon'],locationVerified=True,locationPrecision='city',locationRole=c.get('role','brewery_city_reference'),locationSourceUrl=c['location'],coordinateSourceUrl=coordurl,
    locationNote='品牌起源与公开酒厂所在城市参考点，不代表本款当前逐批生产厂址。' if c.get('role') else '公开资料给出的酒厂所在城市参考点；不代表精确厂址。')
  br['sourceUrls']=list(dict.fromkeys(br.get('sourceUrls',[])+[c['location'],coordurl]));br['locationEvidence']={'verifiedAt':'2026-10-02','identitySourceUrl':c['location'],'coordinateSourceUrl':coordurl,'coordinateSourcePageId':p['pageid'],'coordinateEvidenceFile':str((research/('extra-coordinates.json' if uid in ['1573915','231860','1816194','4044001','6150444'] else 'coordinates.json')).relative_to(R)),'coordinateSha256':sha(research/('extra-coordinates.json' if uid in ['1573915','231860','1816194','4044001','6150444'] else 'coordinates.json')),'productionLocationVerified':False}
 b['sourceNote']='Untappd 获奖身份和评分年度沿用原记录；本轮补齐来源实物图、产品资料与城市参考位置。独立精酿属性和评分年度的同批次包装未全面核实。'
 if uid=='9259':b['craftStatus']='corporate_owned_brand';b['sourceNote']=(b.get('sourceNote') or '')+' 品牌属于 Molson Coors；地图定位为品牌起源城市，不宣称本款当前生产厂址。'
 if uid=='1573915':b['sourceNote']+=' 来源雪景照片的瓶底有轻微积雪遮挡；仅去外部背景，不补画被遮挡像素。'
 if uid=='4044001':b['sourceConflicts']=[{'sourceUrl':c['url'],'fields':['abv','ibu','description','ingredients'],'reason':'Official page body appears copied from a pale wheat beer; contradicts its own Imperial Stout bottle and exact award style. Conflicting facts not imported.'}]
 beers.append(b);breweries[br['id']]=br;evidence.append({'id':b['id'],'sourceSha256':sha(src),'fullSha256':sha(full),'cardSha256':sha(card),'mapSha256':sha(thumb),'method':method,'RGBunchanged':True,'reviewed':'--approve-reviewed' in sys.argv})
 tile=Image.new('RGBA',(300,670),(23,41,39,255));crop=rgba.crop(rgba.getchannel('A').getbbox());crop.thumbnail((270,610));tile.alpha_composite(crop,((300-crop.width)//2,35));draw=ImageDraw.Draw(tile);draw.text((10,10),uid,fill='white');reviews.append(tile)
sheet=Image.new('RGB',(1500,1340))
for i,tile in enumerate(reviews):sheet.paste(tile.convert('RGB'),((i%5)*300,(i//5)*670))
sheet.save(research/'four-packshots-review.jpg')
(research/'packshot-audit.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
(R/'public/data/award-americas-supplements.json').write_text(json.dumps({'metadata':{'id':'award-americas-products-20261002','partial':True,'scope':str(len(beers))+' exact existing award products; not a complete American awards catalogue'},'beers':beers,'breweries':list(breweries.values())},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'beers':len(beers),'located':sum(b['locationVerified'] for b in breweries.values()),'review':str(research/'four-packshots-review.jpg')}))
