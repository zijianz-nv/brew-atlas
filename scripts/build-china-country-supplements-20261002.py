"""Offline China product enrichment. Exact identities, retained originals, alpha-only cutouts."""
import json,copy,pathlib,hashlib,importlib.util
import numpy as np
from PIL import Image,ImageOps,ImageDraw
R=pathlib.Path(__file__).resolve().parents[1];P=R/'public';E=R/'.runtime/china-country-evidence';O=R/'research/china-expansion-2026-10-02';OUT=P/'images/china-country'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('masker',R/'scripts/cutout-saldens-epica.py');masker=importlib.util.module_from_spec(spec);spec.loader.exec_module(masker)
def bounds(im,p):
 a=np.asarray(im.convert('RGBA'))[:,:,3];ys,xs=np.where(a>=64);pad=max(1,round(im.height*.01));l=max(0,int(xs.min())-pad);t=max(0,int(ys.min())-pad);r=min(im.width,int(xs.max())+1+pad);b=min(im.height,int(ys.max())+1+pad)
 return {'width':im.width,'height':im.height,'bounds':{'x':l,'y':t,'width':r-l,'height':b-t},'originalSha256':sha(p),'method':'decoded_alpha_body_with_padding','alphaThreshold':64,'paddingPixels':pad}
def ev(url,fn,basis='public_product_description'):
 return {'sourceUrl':url,'sourceFile':str((E/fn).relative_to(R)),'sourceSha256':sha(E/fn),'retrievedAt':'2026-10-02','sourceType':basis,'method':'faithful_short_summary_of_product_information_not_user_reviews'}
def path(p):return '/'+str(p.relative_to(P))
# Explicit traced silhouettes; no inpainting/recolouring. Coordinates are source pixels,
# except Tui Na is traced on a 600x800 review then scaled to the EXIF-upright source.
spans={
 'tuina': [[236,337,343],[238,321,348],[243,308,349],[248,295,343],[250,174,405],[257,172,407],[265,177,402],[276,174,403],[302,160,417],[326,150,430],[360,151,430],[460,155,428],[560,162,423],[640,169,418],[681,177,409],[702,191,397],[718,213,380],[733,241,357],[741,269,329],[743,287,308],[744,299,300]],
 'benxi-wit': [[48,157,166],[49,153,172],[52,150,174],[56,150,174],[60,153,171],[65,153,171],[89,150,173],[111,148,176],[126,145,179],[135,138,185],[145,134,189],[165,133,190],[240,134,189],[263,137,188],[270,146,182],[272,157,172]],
 'benxi-dry': [[71,157,166],[73,151,171],[77,150,172],[81,152,170],[86,153,169],[112,150,172],[132,146,175],[145,140,179],[153,139,180],[174,139,180],[217,139,179],[238,142,177],[245,148,173],[248,158,165]]}
def picture(slug,raw,url,page,cut=False):
 orig=Image.open(raw);im=ImageOps.exif_transpose(orig).convert('RGBA');raw_hash=sha(raw);method='original_transparent_packshot_preserved';params={}
 if cut:
  points=spans[slug]
  if slug=='tuina':points=[[y*im.height/800,l*im.width/600,r*im.width/600] for y,l,r in points]
  mask=masker.make_mask(im.size,points);original_rgb=np.array(im)[:,:,:3].copy();im.putalpha(mask);full=OUT/(slug+'-cutout.png');im.save(full,compress_level=9);assert np.array_equal(np.asarray(Image.open(full))[:,:,:3],original_rgb)
  method='local_python_reviewed_silhouette_alpha_only';params={'silhouetteSpansYLeftRight':points,'maskSupersampling':4,'exifTranspose':slug=='tuina','sourceCanvasPreservedAfterExifOrientation':True,'rgbOperation':'none; pixel position follows original EXIF orientation'}
 else:full=raw;assert im.getchannel('A').getextrema()==(0,255)
 variants={}
 for kind,maximum in [('card',800),('map',320)]:
  z=im.copy();z.thumbnail((maximum,maximum),Image.Resampling.LANCZOS);fp=OUT/(slug+'-'+kind+'.webp');z.save(fp,format='WEBP',lossless=True);variants[kind]=(z,fp)
 c,cp=variants['card'];p={'image':path(cp),'imageThumbnail':path(variants['map'][1]),'imageOriginal':path(full),'sourceImage':path(raw),'imageKind':'product_packshot','imageDownloadUrl':url,'imageSource':page,'imageContentBounds':bounds(c,cp),'imageLicense':'Copyright holder; no open image licence stated','imageEvidence':{'sourceUrl':page,'downloadUrl':url,'sourceImage':path(raw),'sourceSha256':raw_hash,'originalSha256':raw_hash,'sha256':sha(cp),'fullSha256':sha(full),'method':method,'parameters':params,'individuallyVerified':True,'reviewedAt':'2026-10-02','originalRGBunchanged':True,'derivative':{'mapMax':320,'cardMax':800,'format':'lossless_webp'}}}
 return p
base=json.load(open(O/'existing-input.json'));allold={b['id']:b for b in base['beers']};breweries=copy.deepcopy(base['breweries']);beers=[]
patches=[
('beertasting-af61de68-349f-4e63-bfdc-81a102a81873','丰收道酿的“东方秘术·推拿”社交型浑浊 IPA。酒名取自推拿主题，罐身标示酒精度 4.6%；旧目录的 4.59% 读值保留为来源差异。','https://untappd.com/b/daobrew-ipa-daobrew-oriental-mystery-tuina-session-hazy-ipa/6018504','dao-tuina.html'),
('beertasting-e95de910-9e9b-47bc-9034-18b935b07c12','丰收道酿“长生”西海岸 IPA，酒精度 6.8%。公开产品介绍描述其酒体柔软，带有西柚、蓝莓与百香果的香气。','https://untappd.com/b/daobrew-daobrew-elixir-west-coast-ipa-ipa/5800609','dao-elixir.html'),
('beertasting-954dfa22-46cd-4b45-8c66-88c1ac5b0142','香格里拉“建塘”拉格。Gyalthang 是香格里拉的藏语地名，酒款以家乡为主题；这里展示的罐装版本标示酒精度 2.8%。','https://untappd.com/b/shangri-la-beer-gyalthang/1387134','gyalthang.html'),
('beertasting-b052f1b1-bf95-4079-9b76-4040661c2e52','拾捌精酿“跳东湖”IPA，酒精度 6.2%、苦度 60 IBU。产品介绍将名字联系到武汉人骑车相聚、跃入东湖的夏日活动。','https://www.jiuhuar.com/craftbeer/5a65a2538ba5b0f7078b456f.html','no18-jump.html'),
('beertasting-f81bfe1d-6189-4e01-bbf1-6a7075175f14','拾捌精酿“不接受批评”社交型 IPA，酒精度 4.5%、苦度 30 IBU。产品资料列有 Maris Otter 麦芽与 Mosaic 酒花，并描述柑橘、柚子、菠萝和松针香气。','https://www.jiuhuar.com/craftbeer/5ba1b2278ba5b050218b4567.html','no18-critic.html')]
for bid,desc,url,fn in patches:
 b=copy.deepcopy(allold[bid]);assert not b.get('description');b.update(description=desc,descriptionBasis='public_product_description',descriptionEvidence=ev(url,fn));b['sourceUrls']=list(dict.fromkeys(b.get('sourceUrls',[])+[url]));b['sourceNote']=(b.get('sourceNote') or '')+' 2026-10-02 精确同款公开产品介绍补充，不取用户评论；原身份与城市参考不变。';cp=P/b['image'].lstrip('/');b['imageContentBounds']=bounds(Image.open(cp),cp);beers.append(b)
by={b['id']:b for b in beers}
tuina=beers[0];tuina_source=copy.deepcopy(tuina);tuina.update(picture('tuina',P/tuina['imageOriginal'].lstrip('/'),tuina.get('imageDownloadUrl'),tuina.get('imageSource') or patches[0][2],True));tuina['sourceConflicts']=[{'field':'abv','existingValue':4.59,'packageValue':4.6,'resolution':'existing numeric value retained; can value recorded as rounding difference'}]
beers[2]['sourceConflicts']=[{'field':'version/abv','existingValue':2.8,'publicOlderProductAbv':3.1,'sourceUrl':patches[2][2],'resolution':'use only product-name origin; retain photographed 2.8% can; do not assign older Untappd ID or retirement status'}]
# Generate an independent exact-ID image override; root applies registry atomically.
entry={'beerId':tuina['id'],'sourceImage':tuina_source['imageOriginal'],'sourceSha256':sha(P/tuina_source['imageOriginal'].lstrip('/')),'imageFull':tuina['imageOriginal'],'fullSha256':sha(P/tuina['imageOriginal'].lstrip('/')),'image':tuina['image'],'sha256':sha(P/tuina['image'].lstrip('/')),'imageThumbnail':tuina['imageThumbnail'],'thumbnailSha256':sha(P/tuina['imageThumbnail'].lstrip('/')),'width':3024,'height':4032,'imageContentBounds':tuina['imageContentBounds'],'fullImageContentBounds':bounds(Image.open(P/tuina['imageOriginal'].lstrip('/')),P/tuina['imageOriginal'].lstrip('/')),'thumbnailImageContentBounds':bounds(Image.open(P/tuina['imageThumbnail'].lstrip('/')),P/tuina['imageThumbnail'].lstrip('/')),'method':tuina['imageEvidence']['method'],'parameters':tuina['imageEvidence']['parameters'],'originalRGBunchanged':True,'sourceUnchanged':True,'reviewed':True,'note':'Original EXIF orientation is respected; all RGB pixels retained without repainting, can pull-tab/cap/base included.'}
(O/'tuina-cutout-entry.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n')
for br in breweries:
 if 'f24380' in br['id']:br.update(cityZh='成都',region='Sichuan',regionZh='四川',cityAliases=['成都','Chengdu'])
 elif '369ef6' in br['id']:br.update(cityZh='香格里拉',region='Yunnan',regionZh='云南',cityAliases=['香格里拉','迪庆','Shangri-La','Gyalthang'])
 else:br.update(cityZh='武汉',region='Hubei',regionZh='湖北',cityAliases=['武汉','Wuhan','Wu Han Shi'])
def location(bid,name,city,cityzh,region,regionzh,pageid,coordinatefile,identity,identityfile,industrial=False):
 pg=json.load(open(E/coordinatefile))['query']['pages'][str(pageid)];co=pg['coordinates'][0];cu='https://en.wikipedia.org/wiki/'+pg['title'].replace(' ','_')
 return {'id':bid,'name':name,'city':city,'cityZh':cityzh,'cityAliases':[city,cityzh],'region':region,'regionZh':regionzh,'country':'China','countryZh':'中国','countryCode':'CN','countryBasis':'documented_local_producer','lat':co['lat'],'lng':co['lon'],'locationVerified':True,'locationPrecision':'city','locationRole':'brewery_city_reference','locationSourceUrl':identity,'coordinateSourceUrl':cu,'locationEvidence':{'identitySourceUrl':identity,'identityEvidenceFile':str((E/identityfile).relative_to(R)),'identitySha256':sha(E/identityfile),'coordinateSourceUrl':cu,'coordinateEvidenceFile':str((E/coordinatefile).relative_to(R)),'coordinateSha256':sha(E/coordinatefile),'coordinateSourcePageId':pageid,'coordinatePlaceTitle':pg['title'],'verifiedAt':'2026-10-02'},'locationNote':'公开资料确认酒厂所在城市；坐标为城市参考，不是逐批产品生产厂址。','sourceUrls':[identity,cu],'craftStatus':'industrial_reference' if industrial else 'craft_brewery_reference','catalog_role':'industrial_reference' if industrial else 'brewery_reference'}
bb=json.load(open(E/'bravo-parsed.json'));wb=json.load(open(E/'wusu-parsed.json'))
bravo=location('beertasting-brewery-'+bb['brewery']['id'],bb['brewery']['name'],'Guangzhou','广州','Guangdong','广东',12537,'coordinates.json',bb['url'],'bravo.html');bravo['sourceUrls'].append('https://untappd.com/w/bravo-brewing-co-a-e-c2-e/290538')
wusu=location('beertasting-brewery-'+wb['brewery']['id'],'Wusu Brewery (乌苏啤酒)','Ürümqi','乌鲁木齐','Xinjiang','新疆',199155,'wusu-coordinate.json','https://carlsbergchina.com.cn/zh/新闻发布/2025稳健开局/','wusu-location.html',True);wusu['cityAliases']+=['Urumqi','Wulumuqi','乌鲁木齐'];wusu['locationNote']+=' 嘉士伯官网确认乌鲁木齐酒厂；品牌也有其他工厂，不假定每瓶都在该城生产。'
lsq=location('china-longshanquan-benxi','Longshanquan Beer (龙山泉啤酒)','Benxi','本溪','Liaoning','辽宁',1257619,'coordinates.json','https://www.lsqbeer.com/product/DaLian_651.html','dalian-white.html',True);lsq['locationNote']+=' 官方页面虽有大连SEO前缀，公司地址明确为辽宁本溪市明山区；不把该前缀认作酒厂城市。'
breweries.extend([bravo,wusu,lsq])
items=[
('bravo-reset','beertasting-08ebd372-e2f6-45cd-8870-ce194a4f6377','重启 1.2 酸 IPA · Reset 1.2 Sour IPA',bravo['id'],'Sour IPA',4.5,'保霖精酿“重启 1.2”酸印度淡色艾尔，广州酒厂公开目录标示酒精度 4.5%；实罐为 330mL。尚未核得独立风味正文，因此仅展示已验证的产品规格。','https://www.beertasting.com/en/beers/reset-12-sour-ipa','bravo-product.html',bb['records'][0]['image_url'],False),
('wusu-red','beertasting-ef13ee0f-3f49-4306-a1bd-83df99078e86','乌苏红标 · Wusu Red',wusu['id'],'Lager',4.0,'乌苏红标拉格，公开目录标示酒精度 4%。产品简介描述麦芽甜香、轻微焦糖与草本酒花气息，收尾略苦。该品牌属于工业啤酒参考，不标作独立精酿。','https://www.beertasting.com/en/beers/xinjiang-wusu-red','wusu-red-description.html','https://beertasting.app/storage/media/bcc9d97f3fb16ad7958b3c42f73fd7b3/qfenwoutlovsnn6qebkx.png',False),
('wusu-white','beertasting-079d4a27-e1ff-4ef2-bd47-88744aa0053d','乌苏白啤 · Wusu White Beer',wusu['id'],'Wheat Beer',4.5,'乌苏白啤以小麦酿造，公开产品介绍记载酒液呈金黄色，酒精度 4.5%。这里展示 500mL 白蓝色罐装；属于工业品牌参考。','https://www.jiuhuar.com/craftbeer/6592827b526c603174115d95.html','wusu-white-description.html','https://beertasting.app/storage/media/d61a1961f86e2de7fbef9fe59c84f4af/WhatsApp_Bild_2025-02-16_um_08.52.14_57cb0177-removebg-preview.png',False),
('benxi-wit','china-longshanquan-original-witbier','龙山泉原浆白啤 · Original Witbier',lsq['id'],'Witbier',3.7,'来自本溪龙山泉的原浆白啤，酒精度 3.7%。产品介绍列有加拿大与澳大利亚大麦芽、欧洲小麦芽和萨兹酒花，采用上层发酵，酒液浑浊、苦味较低。','https://www.jiuhuar.com/craftbeer/5d42cb048ba5b0d53a8b456a.html','benxi-jiuhuar.html','https://file1.jiuhuar.com/bg-Fv0y5X95MzMGpmQTYax_xGrkqXkg',True),
('benxi-dry','china-longshanquan-dry-lager','龙山泉干啤 · Dry Beer',lsq['id'],'Pale Lager',3.5,'龙山泉干啤，酒精度 3.5%。公开产品资料列有泉水、澳大利亚麦芽、大米与进口酒花，描述其收口偏干；酒厂官网地址位于辽宁本溪。','https://www.jiuhuar.com/craftbeer/5b7fe6617901124e0fd9fc0d.html','benxi-dry.html','https://file1.jiuhuar.com/bg-FjCHU1BKjnVnAtQbKaWbRS0bAByP',True)]
for slug,bid,name,brid,style,abv,desc,url,fn,imgurl,cut in items:
 industrial=brid!=bravo['id'];b={'id':bid,'name':name,'breweryId':brid,'collection':'regional','collections':['regional'],'style':style,'abv':abv,'ibu':None,'description':desc,'descriptionEvidence':ev(url,fn),'descriptionBasis':'verified_product_specification' if slug=='bravo-reset' else 'public_product_description','flavorDescriptionVerified':slug!='bravo-reset','flavors':[],'hops':[],'malts':[],'rating':None,'ratingsCount':None,'awards':[],'imageCredit':'Public product catalogue, original photographer not identified','sourceUrls':[url,imgurl],'sourceNote':'公开产品目录人工核对名称与实物包装；介绍来自产品正文，不使用用户评论。城市为酒厂参考，不是逐批生产定位。'+(' 工业品牌参考，不声称独立精酿。' if industrial else ''),'craftStatus':'industrial_reference' if industrial else 'craft_brewery_reference','catalog_role':'industrial_reference' if industrial else 'brewery_reference'}
 b.update(picture(slug,OUT/(slug+'-original.png'),imgurl,url,cut))
 if bid.startswith('beertasting-'):
  row=next(x for x in (bb['records']+wb['records']) if 'beertasting-'+x['id']==bid);b.update(rating=round(row['rating'],2) if row['rating'] is not None else None,ratingsCount=row['ratings_count'],sourceRecord={'id':row['id'],'ibu':row['ibu_raw'],'style':row['style'],'style_family':row['style_family'],'source_url':row['source_url']});b['sourceUrls'].append(row['source_url'])
 beers.append(b)
assert len(beers)==10 and len({b['id'] for b in beers})==10
brmap={b['id']:b for b in breweries}
for b in beers:
 assert b['description'] and brmap[b['breweryId']]['locationVerified']
 for k in ['image','imageOriginal','imageThumbnail']:Image.open(P/b[k].lstrip('/')).verify()
summary={'createdAt':'2026-10-02','scope':'China: six city references, 10 reviewed products','newRecords':5,'exactExistingRecordEnrichments':5,'cities':['Chengdu','Wuhan','Shangri-La','Guangzhou','Ürümqi','Benxi'],'regions':['Sichuan','Hubei','Yunnan','Guangdong','Xinjiang','Liaoning'],'industrialReferenceRecords':4,'status':'ready','images':'five new packshots and one exact-existing alpha-only cutout; originals retained','excluded':[{'id':'beertasting-b1f43f58-fd70-43ca-ae14-4130a89dd546','reason':'Soyala record image reads YALASO; version not reliably matched, no enrichment applied'},{'products':['Wusu Draft','Wusu Green','Longshanquan official White/Ale images'],'reason':'official image URLs returned 403; stopped, selected other individually verified products instead'}]}
(P/'data/china-country-supplements.json').write_text(json.dumps({'metadata':summary,'breweries':breweries,'beers':beers},ensure_ascii=False,indent=2)+'\n')
(O/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
sheet=Image.new('RGB',(1800,650),(25,38,47));d=ImageDraw.Draw(sheet)
for idx,b in enumerate([tuina]+beers[-5:]):
 im=Image.open(P/b['image'].lstrip('/')).convert('RGBA');box=b['imageContentBounds']['bounds'];im=im.crop((box['x'],box['y'],box['x']+box['width'],box['y']+box['height']));im.thumbnail((265,570));sheet.paste(im,(idx*300+(300-im.width)//2,65),im);d.text((idx*300+7,15),['Tui Na','Bravo Reset','Wusu Red','Wusu White','Longshan Wit','Longshan Dry'][idx],fill='white')
sheet.save(E/'china-reviewed.jpg');print('ready: 10 products, 6 breweries, 5 new / 5 enriched; independent Tui Na override ready')
