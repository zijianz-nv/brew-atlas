"""Five-country gap batch. Offline, exact-ID supplements; preserve original picture pixels."""
import json, pathlib, hashlib, copy, xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
import numpy as np
R=pathlib.Path(__file__).resolve().parents[1];P=R/'public';E=R/'.runtime/global-country-evidence';O=R/'research/award-country-expansion-2026-10-02'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ev(url,fn):return {'sourceUrl':url,'sourceFile':str((E/fn).relative_to(R)),'sourceSha256':sha(E/fn),'retrievedAt':'2026-10-02','method':'faithful_short_summary_of_public_product_information'}
def bounds(im,p):
 a=np.asarray(im.convert('RGBA'))[:,:,3];ys,xs=np.where(a>=64);pad=max(1,round(im.height*.01));l=max(0,int(xs.min())-pad);t=max(0,int(ys.min())-pad);r=min(im.width,int(xs.max())+1+pad);b=min(im.height,int(ys.max())+1+pad)
 return {'width':im.width,'height':im.height,'bounds':{'x':l,'y':t,'width':r-l,'height':b-t},'originalSha256':sha(p),'method':'decoded_alpha_body_with_padding','alphaThreshold':64,'paddingPixels':pad}
def picture(slug,url,page):
 raw=P/f'images/global-country/{slug}-image.png';im=Image.open(raw).convert('RGBA');assert im.getchannel('A').getextrema()==(0,255)
 out={}
 for kind,size in [('card',800),('map',320)]:
  z=im.copy();z.thumbnail((size,size),Image.Resampling.LANCZOS);fp=P/f'images/global-country/{slug}-{kind}.webp';z.save(fp,format='WEBP',lossless=True);out[kind]=(z,fp)
 card,cp=out['card'];return {'image':'/'+str(cp.relative_to(P)),'imageThumbnail':'/'+str(out['map'][1].relative_to(P)),'imageOriginal':'/'+str(raw.relative_to(P)),'sourceImage':'/'+str(raw.relative_to(P)),'imageKind':'product_packshot','imageDownloadUrl':url,'imageSource':page,'imageLicense':'Copyright holder; no open image licence stated','imageContentBounds':bounds(card,cp),'imageEvidence':{'sourceUrl':page,'downloadUrl':url,'sourceImage':'/'+str(raw.relative_to(P)),'originalSha256':sha(raw),'sha256':sha(cp),'fullSha256':sha(raw),'individuallyVerified':True,'method':'original_transparent_packshot_preserved','originalRGBunchanged':True,'reviewedAt':'2026-10-02','derivative':{'mapMax':320,'cardMax':800,'format':'lossless_webp'},'visualReview':'真实单瓶包装，瓶口与瓶底完整；原图字节保留，展示图仅等比缩小。原官网轻微投影仍保留。'}}
def location(bid,name,city,cityzh,country,cz,cc,fn,identity,identityfile,aliases=[]):
 node=ET.parse(E/fn).getroot().find('node');tags={t.attrib['k']:t.attrib['v'] for t in node.findall('tag')};assert tags.get('place')=='city';url='https://www.openstreetmap.org/node/'+node.attrib['id']
 return {'id':bid,'name':name,'city':city,'cityZh':cityzh,'cityAliases':aliases,'country':country,'countryZh':cz,'countryCode':cc,'countryBasis':'documented_local_producer','lat':float(node.attrib['lat']),'lng':float(node.attrib['lon']),'locationVerified':True,'locationPrecision':'city','locationRole':'brewery_city_reference','locationSourceUrl':identity,'coordinateSourceUrl':url,'locationNote':'来源明确所在城市；坐标为该城市参考点，不是厂房或逐款生产定位。','locationEvidence':{'identitySourceUrl':identity,'identityEvidenceFile':str((E/identityfile).relative_to(R)),'identitySha256':sha(E/identityfile),'coordinateSourceUrl':url,'coordinateEvidenceFile':str((E/fn).relative_to(R)),'coordinateSha256':sha(E/fn),'coordinateSourcePageId':node.attrib['id'],'coordinatePlaceTitle':city,'coordinateProvider':'OpenStreetMap','attribution':'© OpenStreetMap contributors, ODbL','verifiedAt':'2026-10-02'},'sourceUrls':[identity,url],'catalog_role':'industrial_reference','catalogRole':'industrial_reference','craftStatus':'industrial_reference'}
base=json.load(open(O/'existing-six-input.json'));beers=copy.deepcopy(base['beers']);breweries=copy.deepcopy(base['breweries']);by={b['id']:b for b in beers}
patches=[
('beertasting-6c47c443-fc22-4469-95ed-156e9f401dac','加纳 Tale 的洛神花啤酒。生产商将这款 6% 酒精度的 Hibiscus IPA 列为常规系列；品牌配料页明确列有洛神花。','https://www.specialtybeers-gh.com/beers/tale','tale-origin.html'),
('beertasting-4e5102da-2374-487d-aa93-f897cc232037','来自加纳的 Tale 姜味三料艾尔，酒精度 7%。品牌介绍其采用姜与当地谷物，呈现辛香风味。','https://www.tale-beer.com/beer/ginger','tale-ginger-current.html'),
('beertasting-11edc109-e7e8-4c5b-ae86-77c5c01ebe7b','Bandido 的 Hop Rey IPA。厄瓜多尔零售产品资料列有 Cascade、Willamette 与 Chinook 酒花，描述其柑橘、草本香气与明显苦味。','https://www.aki.com.ec/producto/cerveza-hop-rey-ipa-bandido-500-ml/','bandido-hoprey.html'),
('beertasting-79c69415-6212-4fb8-93cc-307d8d59a4c8','Bandido 的蜂蜜姜味赛松。产品资料描述蜂蜜甜味与姜的辛香相互平衡，酒体轻盈，收尾清爽。','https://www.supermaxi.com/producto/cerveza-honey-ginger-saison-bandido-500-ml/','bandido-ginger.html'),
('beertasting-b5577eba-3612-4848-b954-c3b60b5db7f7','Pasteur Street 的旗舰西海岸 IPA，加入越南北部沙坝的茉莉花。酒厂描述它带有柑橘香气，口感干净而平衡。','https://pasteurstreet.com/jasmine-ipa-the-beer-that-launched-an-industry/','pasteur-jasmine.html'),
('beertasting-742d886a-35d3-4c0c-812b-784366348fcd','Pasteur Street 的柚子 IPA，酒精度 6.2%。酒厂介绍灵感来自湄公河三角洲的柚子，呈现柚子的甜香与花香特色。','https://pasteurstreet.com/beyond-the-hops-a-guide-to-vietnams-unique-craft-beer-ingredients/','pasteur-ingredients.html')]
for bid,desc,url,fn in patches:
 b=by[bid];assert not b.get('description');assert b.get('image');b['description']=desc;b['descriptionEvidence']=ev(url,fn);b['descriptionBasis']='retailer_product_description' if 'bandido' in fn else 'official_product_description';b['sourceUrls']=list(dict.fromkeys(b.get('sourceUrls',[])+[url]));b['sourceNote']=(b.get('sourceNote') or '')+' 2026-10-02 按精确酒名和生产商补公开产品介绍；沿用已核对的同款本地瓶图与城市参考，不改旧记录身份。';cp=P/b['image'].lstrip('/');b['imageContentBounds']=bounds(Image.open(cp),cp)
by[patches[0][0]]['sourceConflicts']=[{'field':'style','existingValue':'IPA - Other','currentBrandPageValue':'Pale Ale','currentSourceUrl':'https://www.tale-beer.com/beer/hibiscus','resolution':'keep_existing_style_and_packaging; producer lineup explicitly names Hibiscus IPA 6%; current recipe continuity not assumed'}]
by[patches[0][0]]['descriptionEvidence']['supportingSourceUrls']=['https://www.tale-beer.com/beer/hibiscus']
# Exact existing Habesha article identity retained, including existing official sales data.
hab=json.load(open(O/'existing-habesha-input.json'));h=copy.deepcopy(hab['beers'][0]);oldbr=hab['breweries'][0];haburl='https://www.habeshabreweries.com/habesha-beer'
hbr=copy.deepcopy(oldbr);hbr.update(location(oldbr['id'],oldbr['name'],'Debre Birhan','德布雷贝尔汉','Ethiopia','埃塞俄比亚','ET','debre-birhan-osm.xml',haburl,'habesha.html',['Debre Berhan','ደብረ ብርሃን']));hbr['sourceUrls']=list(dict.fromkeys(oldbr.get('sourceUrls',[])+hbr['sourceUrls']));breweries.append(hbr)
h.update(description='埃塞俄比亚 Habesha 的 Cold Gold 金色拉格。酒厂介绍采用德布雷贝尔汉高地的水、麦芽与酒花，呈现顺滑口感。公开页面未核得酒精度，继续留空。',descriptionBasis='official_product_description',descriptionEvidence=ev(haburl,'habesha.html'),imageCredit='Habesha Breweries official product catalogue',catalog_role='industrial_reference',catalogRole='industrial_reference',craftStatus='industrial_reference');h.update(picture('habesha','https://images.squarespace-cdn.com/content/v1/59f0a6e9f09ca487886b21e2/1509024141613-HPKKOY6J9FCOCLDXPRKM/our-beer-habesha-shadow.png',haburl));h['sourceUrls']=list(dict.fromkeys(h.get('sourceUrls',[])+[haburl,h['imageDownloadUrl']]));h['sourceNote']=(h.get('sourceNote') or '')+' 精确同名 Cold Gold 官网瓶图与介绍补充；工业品牌参考，不声称独立精酿。';beers.append(h)
# ECAE government certification lists Balegeru at the Debrebirhan Dashen factory.
dashurl='https://ecae.org.et/?page_id=739';db=location('global-et-dashen-debre-birhan','Dashen Brewery — Debre Birhan','Debre Birhan','德布雷贝尔汉','Ethiopia','埃塞俄比亚','ET','debre-birhan-osm.xml',dashurl,'dashen-certified.html',['Debre Berhan','ደብረ ብርሃን']);db['sourceUrls'].append('https://hetriil.moe.gov.et/industries/350');breweries.append(db)
solurl='https://www.solibra.ci/nos-marques/nos-marques/bieres-100.html';sb=location('global-ci-solibra','SOLIBRA','Abidjan','阿比让','Côte d’Ivoire','科特迪瓦','CI','abidjan-osm.xml',solurl,'solibra-bock.html',['Treichville']);breweries.append(sb)
items=[
('balageru','global-et-dashen-balageru','Balageru',db['id'],'Lager',5.2,'埃塞俄比亚 Dashen 的 Balageru 拉格，产品目录标示酒精度 5.2%，瓶身标有 100% 大麦。埃塞俄比亚合格评定机构将该品牌列在 Dashen 德布雷贝尔汉酒厂的产品中。','https://www.beertasting.com/en/brewery/dashen-brewery/beers','dashen-bt.html','https://beertasting.app/storage/media/c4492cd8d48dd8c0866b4dbc638b8471/eqnyhwsyxkgk7z6ij4yo.png'),
('bock','global-ci-bock','Bock',sb['id'],'Lager',4.8,'科特迪瓦 SOLIBRA 的 Bock 金色啤酒，酒精度 4.8%。官方配料表列有水、麦芽、玉米与酒花。',solurl,'solibra-bock.html','https://www.solibra.ci/files/photo131224111957.png'),
('beaufort','global-ci-beaufort-lager','Beaufort Lager',sb['id'],'Lager',5.0,'SOLIBRA 在科特迪瓦销售的 Beaufort 金色拉格，酒精度 5%。官网介绍其口感轻盈而细致，并记载品牌于 2008 年在当地推出。','https://www.solibra.ci/nos-marques/bieres-97.html','solibra-beaufort.html','https://www.solibra.ci/files/photo131224161144.png'),
('doppel','global-ci-doppel-munich','Doppel Munich',sb['id'],'Brown Lager',6.5,'科特迪瓦 SOLIBRA 的棕色啤酒，酒精度 6.5%。官网描述其香气明显，配料包含水、麦芽、玉米与酒花。','https://www.solibra.ci/nos-marques/bieres-367.html','solibra-doppel.html','https://www.solibra.ci/files/photo081224102818-photo3.png')]
for slug,bid,name,brew,style,abv,desc,url,fn,imgurl in items:
 b={'id':bid,'name':name,'breweryId':brew,'collection':'regional','collections':['regional'],'style':style,'abv':abv,'ibu':None,'description':desc,'descriptionEvidence':ev(url,fn),'descriptionBasis':'verified_product_specification' if slug=='balageru' else 'official_product_description','flavors':[],'hops':[],'malts':[],'rating':None,'ratingsCount':None,'awards':[],'imageCredit':'Dashen / BeerTasting public product catalogue' if slug=='balageru' else 'SOLIBRA official product catalogue','sourceUrls':[url,imgurl],'sourceNote':'为缺少当地可展示酒款的国家补充真实工业品牌参考；不标注为独立精酿，不声称销量或获奖。','catalog_role':'industrial_reference','catalogRole':'industrial_reference','craftStatus':'industrial_reference'}
 b.update(picture(slug,imgurl,url))
 if slug=='balageru':b.update(rating=2.68,ratingsCount=2,sourceIds=['beertasting-c23a8ae8-f1ae-404a-8bd8-c4eefd97d2bc'],sourceRecord={'id':'c23a8ae8-f1ae-404a-8bd8-c4eefd97d2bc','ibu':0,'breweryCity':'Gonder','note':'Product catalogue headquarters differs from ECAE certified product factory; explicit Debre Birhan branch reference is used.'});b['sourceUrls'].append(dashurl);b['descriptionEvidence']['supportingSourceUrls']=[dashurl]
 beers.append(b)
assert len(beers)==11 and len({b['id'] for b in beers})==11
brmap={b['id']:b for b in breweries}
for b in beers:
 assert b['description'] and b['image'];assert brmap[b['breweryId']]['locationVerified'];assert all((P/b[k].lstrip('/')).is_file() for k in ['image','imageOriginal','imageThumbnail'])
output={'metadata':{'createdAt':'2026-10-02','method':'reviewed_public_product_pages_and_exact_existing_id_enrichment','scopeCountries':['ET','CI','GH','EC','VN'],'newRecords':4,'exactExistingRecordEnrichments':7,'sourceDescriptions':'brief faithful summaries; no guessed flavor or review text','industrialReferenceRecords':5,'status':'ready'},'breweries':breweries,'beers':beers}
(P/'data/global-country-supplements.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
sheet=Image.new('RGB',(1500,700),(32,41,48));d=ImageDraw.Draw(sheet)
for i,b in enumerate([h]+beers[-4:]):
 im=Image.open(P/b['image'].lstrip('/')).convert('RGBA');box=b['imageContentBounds']['bounds'];im=im.crop((box['x'],box['y'],box['x']+box['width'],box['y']+box['height']));im.thumbnail((270,630));sheet.paste(im,(i*300+(300-im.width)//2,50),im);d.text((i*300+12,12),b['name'],fill='white')
sheet.save(E/'new-five-reviewed.jpg');print('ready:',len(beers),'records,',len(breweries),'breweries; new4/enriched7')
