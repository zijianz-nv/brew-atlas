"""Offline 10-country batch: exact public products, 13 originals, 6 existing photo enrichments.
Never request pages, generate labels, infer flavors from style, or change old identities.
"""
import pathlib,json,copy,hashlib,importlib.util,xml.etree.ElementTree as ET
from PIL import Image,ImageDraw
import numpy as np
R=pathlib.Path(__file__).resolve().parents[1];P=R/'public';E=R/'.runtime/global-country-wave2-evidence';O=R/'research/global-country-wave2-2026-10-02';D=P/'images/global-country-wave2'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def asset(p):return '/'+str(p.relative_to(P))
def ev(url,fn,kind='crowdsourced_public_product_description'):
 return {'sourceUrl':url,'sourceFile':str((E/fn).relative_to(R)),'sourceSha256':sha(E/fn),'retrievedAt':'2026-10-02','sourceType':kind,'method':'short_faithful_product_summary; excludes user reviews'}
def bounds(im,p):
 a=np.asarray(im.convert('RGBA'))[:,:,3];ys,xs=np.where(a>=64);pad=max(1,round(im.height*.01));l=max(0,int(xs.min())-pad);t=max(0,int(ys.min())-pad);r=min(im.width,int(xs.max())+1+pad);b=min(im.height,int(ys.max())+1+pad)
 return {'width':im.width,'height':im.height,'bounds':{'x':l,'y':t,'width':r-l,'height':b-t},'originalSha256':sha(p),'method':'decoded_alpha_body_with_padding','alphaThreshold':64,'paddingPixels':pad}
spans=[[20,291,308],[22,280,320],[26,273,326],[32,272,327],[37,274,325],[45,272,327],[53,274,325],[59,277,323],[69,275,325],[103,272,328],[140,268,332],[176,263,337],[207,254,346],[229,242,358],[247,236,364],[267,233,367],[320,233,367],[470,233,367],[555,235,366],[572,241,361],[580,262,340],[584,285,319],[585,299,301]]
imageaudit=[]
def picture(slug,url,page):
 raw=D/(slug+'-original.png');im=Image.open(raw).convert('RGBA');assert im.getchannel('A').getextrema()==(0,255);full=raw;method='original_transparent_product_packshot';params={}

 # The official Djama PNG already has transparent background pixels with grey RGB.
 # Preserve its alpha; replacing the mask would reveal that hidden grey RGB.

 vs={}
 for kind,n in [('card',800),('map',320)]:
  z=im.copy();z.thumbnail((n,n),Image.Resampling.LANCZOS);p=D/(slug+'-'+kind+'.webp');z.save(p,format='WEBP',lossless=True);vs[kind]=(z,p)
 card,cp=vs['card'];item={'sourceImage':asset(raw),'sourceSha256':sha(raw),'imageFull':asset(full),'fullSha256':sha(full),'image':asset(cp),'sha256':sha(cp),'imageThumbnail':asset(vs['map'][1]),'thumbnailSha256':sha(vs['map'][1]),'width':im.width,'height':im.height,'method':method,'parameters':params,'originalRGBunchanged':True,'reviewed':True,'alphaRange':list(im.getchannel('A').getextrema()),'imageContentBounds':bounds(card,cp)};imageaudit.append(item)
 return {'image':item['image'],'imageOriginal':item['imageFull'],'imageThumbnail':item['imageThumbnail'],'imageContentBounds':item['imageContentBounds'],'sourceImage':item['sourceImage'],'imageDownloadUrl':url,'imageSource':page,'imageKind':'product_packshot','imageLicense':'Copyright holder; no open licence for product image stated','imageEvidence':{'sourceUrl':page,'downloadUrl':url,'sourceImage':item['sourceImage'],'sourceSha256':item['sourceSha256'],'originalSha256':item['sourceSha256'],'sha256':item['sha256'],'fullSha256':item['fullSha256'],'individuallyVerified':True,'reviewedAt':'2026-10-02','method':method,'parameters':params,'originalRGBunchanged':True,'derivative':{'cardMax':800,'mapMax':320,'format':'lossless_webp'},'reviewNote':'Complete named bottle/can checked; no logo, label-only or generic draught image accepted.'}}
old=json.load(open(O/'existing-input.json'));oldbeers={b['id']:b for b in old['beers']};oldbrews={b['id']:b for b in old['breweries']};beers=[];breweries={}
patches=[
('beertasting-4bfebb1f-9ecd-4cc8-a727-60e8bd67da83','乌干达 Banange 的琥珀艾尔，酒精度 5%。官网介绍将浅色与深色焦糖风味和慕尼黑麦芽的甜香结合，苦味较低。','https://www.banangebrewing.com/beer','banange-beers.html','official_product_description'),
('beertasting-e9633ab2-c179-424d-bac4-2935e5931548','Banange 的比利时风格小麦啤酒，酒精度 5.8%。官网列有比利时修道院酵母、橙皮与压碎的芫荽籽，描述其口感丝滑，带有柠檬气息。','https://www.banangebrewing.com/beer','banange-beers.html','official_product_description'),
('beertasting-1fa3437d-9a69-4860-9844-8fa48d9bed10','纳米比亚 Namib Dunes 的爱尔兰红艾尔，酒精度 5.2%。公开产品简介描述太妃糖与焦糖香气、轻微烘烤味，收尾偏干。','https://www.beertasting.com/en/brewery/namib-dunes-craft-brewery/beers','namib-dunes-craft-brewery.html','crowdsourced_public_product_description'),
('beertasting-552f8275-03cd-4a00-a6a2-44a704ca1aa0','摩洛哥 Casablanca Premium 拉格，酒精度 5%。公开产品简介描述轻柔麦芽香气、清爽酒体与略带辛香的收尾。','https://www.beertasting.com/en/brewery/brasseries-du-maroc/beers','brasseries-du-maroc.html','crowdsourced_public_product_description'),
('beertasting-1c6e2317-cd9b-484e-86a2-f19165d61c13','摩洛哥 Flag Spéciale Original，酒精度 5.2%。公开产品资料记载其采用大麦与芳香酒花，口味平衡，强调清爽感。','https://www.beertasting.com/en/brewery/brasseries-du-maroc/beers','brasseries-du-maroc.html','crowdsourced_public_product_description'),
('beertasting-2be55040-0a19-487e-84b4-349a9e9724b5','津巴布韦 Delta 的 Eagle Lager。生产商介绍其利用当地种植的高粱酿造，以当地谷物降低原料成本，同时支持农户；酒款目录标示酒精度 5%。','https://delta.co.zw/product/eagle-lager/','delta-eagle-official.html','official_product_description')]
for bid,desc,url,fn,kind in patches:
 b=copy.deepcopy(oldbeers[bid]);assert not b.get('description');b.update(description=desc,descriptionBasis=kind,descriptionEvidence=ev(url,fn,kind));b['sourceUrls']=list(dict.fromkeys(b.get('sourceUrls',[])+[url]));b['sourceNote']=(b.get('sourceNote') or '')+' 2026-10-02 同款真实包装与产品正文逐项核对后补简介，原城市与记录身份不变。';ip=P/b['image'].lstrip('/');b['imageContentBounds']=bounds(Image.open(ip),ip);beers.append(b);breweries[b['breweryId']]=copy.deepcopy(oldbrews[b['breweryId']])
 if oldbrews[b['breweryId']].get('country') in ['Morocco','Zimbabwe']:b.update(craftStatus='industrial_reference',catalog_role='industrial_reference')
 if '2be55040' in bid:b['sourceConflicts']=[{'field':'official generic lower specification table','sourceValue':'South Africa / Extra Cold lager / Castle Lite-like nutrition','resolution':'not used: appears to be unrelated template table; only Eagle-specific body text about sorghum is summarized; producer country retained from verified existing brewery identity'}]
coords=json.load(open(E/'coordinates.json'))['query']['pages']
def city_ref(bid,name,city,cityzh,country,cz,cc,pageid,identity,fn,industrial=False):
 pg=coords[str(pageid)];co=pg['coordinates'][0];cu='https://en.wikipedia.org/wiki/'+pg['title'].replace(' ','_')
 return {'id':bid,'name':name,'country':country,'countryZh':cz,'countryCode':cc,'countryBasis':'documented_local_producer','city':city,'cityZh':cityzh,'cityAliases':[city,cityzh],'lat':co['lat'],'lng':co['lon'],'locationVerified':True,'locationPrecision':'city','locationRole':'brewery_city_reference','locationSourceUrl':identity,'coordinateSourceUrl':cu,'sourceUrls':[identity,cu],'locationNote':'城市参考点，非精确厂房或逐批产品生产位置。','locationEvidence':{'identitySourceUrl':identity,'identityEvidenceFile':str((E/fn).relative_to(R)),'identitySha256':sha(E/fn),'coordinateSourceUrl':cu,'coordinateEvidenceFile':str((E/'coordinates.json').relative_to(R)),'coordinateSha256':sha(E/'coordinates.json'),'coordinateSourcePageId':pageid,'coordinatePlaceTitle':pg['title'],'verifiedAt':'2026-10-02'},'craftStatus':'industrial_reference' if industrial else 'craft_brewery_reference','catalog_role':'industrial_reference' if industrial else 'brewery_reference'}
configs=[('cadejo-brewing','San Salvador','圣萨尔瓦多','El Salvador','萨尔瓦多','SV',57631,False),('les-brasseries-du-cameroun','Douala','杜阿拉','Cameroon','喀麦隆','CM',19997263,True),('cerveceria-hondurena-ab-inbev','San Pedro Sula','圣佩德罗苏拉','Honduras','洪都拉斯','HN',207598,True),('compania-cervecera-de-nicaragua','Managua','马那瓜','Nicaragua','尼加拉瓜','NI',57042,True)]
rows={}
for slug,city,cityzh,country,cz,cc,pid,industrial in configs:
 d=json.load(open(E/(slug+'-parsed.json')));rows.update({b['id']:b for b in d['records']});br=city_ref('beertasting-brewery-'+d['brewery']['id'],d['brewery']['name'],city,cityzh,country,cz,cc,pid,d['url'],slug+'.html',industrial)
 br['sourceRecord']={'breweryId':d['brewery']['id'],'city':d['brewery']['city'],'region':d['brewery']['region']}
 if cc=='SV':br['locationNote']+=' 目录Zona Rosa是圣萨尔瓦多城区；城市参考采用其上级城市，不伪称新生产基地。'
 if cc=='HN':br['locationEvidence'].update(identitySourceUrl='https://www.cerveceriahondurena.com/contactanos',identityEvidenceFile=str((E/'honduras-location.html').relative_to(R)),identitySha256=sha(E/'honduras-location.html'));br['sourceUrls'].append('https://www.cerveceriahondurena.com/contactanos');br['locationNote']+=' 官网明确San Pedro Sula，忽略公开目录错误的Islas de la Bahía区域值。'
 breweries[br['id']]=br
short={
 'Roja':'萨尔瓦多 Cadejo 的红艾尔，酒精度 5.3%。产品简介描述酒花苦味与焦糖麦芽的柔和甜味相互平衡。',
 'La Negra':'Cadejo 的深色干世涛，酒精度 4.8%。公开产品简介描述其烘烤香气、顺滑口感与不过分强烈的苦味。',
 'Mera Belga':'Cadejo 的比利时风格白啤，酒精度 4.8%。公开产品简介描述芫荽、轻微辛香与较轻的酒体。',
 'Mützig':'喀麦隆 Boissons du Cameroun 授权酿造的 Mützig。酒款目录标示酒精度 5.5%，描述谷物香气与偏干、带苦味的口感。',
 'Castel Beer (Cameroon)':'喀麦隆版 Castel 金色拉格，由当地 Boissons du Cameroun 出品。官网标示酒精度 5.2%，介绍其口感细致、清爽；与其他国家生产的同品牌酒分开记录。',
 'Salva Vida':'洪都拉斯 Salva Vida 金色拉格，酒精度 4.8%。公开产品简介描述谷物甜味、轻微柑橘和柔和的花香酒花气息。',
 'Imperial':'洪都拉斯 Imperial 淡色拉格，酒精度 5%。公开产品简介描述浅色麦芽与谷物香气，口味偏干。',
 'Cervecera de Nicaragua Tona':'尼加拉瓜 Toña 金色拉格，酒精度 4.6%。公开产品简介描述柔和麦芽甜香、柑橘与草本酒花气息，收尾适度苦涩。',
 'Victoria Frost':'尼加拉瓜 Victoria Frost 皮尔森，酒精度 4.9%。公开产品目录介绍其采用微滤工艺；工业品牌参考，不声称为独立精酿。'}
selected=json.load(open(E/'selected-bt-records.json'))
def basebeer(bid,name,brid,style,abv,ibu,desc,evd):
 return {'id':bid,'name':name,'breweryId':brid,'collection':'regional','collections':['regional'],'style':style,'abv':abv,'ibu':ibu,'description':desc,'descriptionBasis':evd['sourceType'],'descriptionEvidence':evd,'flavors':[],'hops':[],'malts':[],'rating':None,'ratingsCount':None,'awards':[],'sourceUrls':[evd['sourceUrl']],'sourceNote':'按真实当地生产商补足国家可展示酒款；公共产品资料人工核对，城市或地方参考不是逐批生产厂址。未声明独立精酿或全球畅销排名。'}
for raw in selected:
 r=rows[raw['id']];slug=r['source_url'].split('/brewery/')[1].split('/')[0];name=r['name'];br=breweries['beertasting-brewery-'+r['brewery_id']];e=ev(r['source_url'],slug+'.html')
 if name=='Castel Beer (Cameroon)':e=ev('https://boissonsducameroun.com/une-boissons/castel/','cameroon-castel.html','official_product_description')
 b=basebeer('beertasting-'+r['id'],name,br['id'],r['style'],r['abv_percent'],r['ibu_raw'] if r['ibu_raw'] and r['ibu_raw']>0 else None,short[name],e);b.update(rating=round(r['rating'],2) if r['rating'] is not None else None,ratingsCount=r['ratings_count'],sourceRecord={'id':r['id'],'style':r['style'],'style_family':r['style_family'],'ibu':r['ibu_raw'],'url':r['url'],'source_url':r['source_url']},craftStatus=br['craftStatus'],catalog_role=br['catalog_role']);b.update(picture(r['id'],r['image_url'],r['url']));b['sourceUrls']=list(dict.fromkeys(b['sourceUrls']+[r['url'],r['source_url'],r['image_url']]))
 if name=='Mützig':b['sourceUrls'].append('https://boissonsducameroun.com/une-boissons/mutzig/');b['descriptionEvidence']['supportingEvidence']=ev('https://boissonsducameroun.com/une-boissons/mutzig/','cameroon-mutzig.html','official_local_licensed_producer')
 beers.append(b)
# Current official site says canned ABC beers are now produced at Pantera in Guatemala City.
ab=city_ref('global-wave2-antigua-pantera','Antigua Brewing Co. / Cervecería Pantera','Guatemala City','危地马拉城','Guatemala','危地马拉','GT',11874,'https://www.antiguabrewingco.com/es','antigua-official.html');ab['cityAliases']+=['Ciudad de Guatemala'];ab['locationNote']+=' 品牌起源Antigua；本批为官网罐装系列，官网明确现于危地马拉城Pantera酒厂酿造与装罐。没有将Antigua酒吧误作罐装厂。';breweries[ab['id']]=ab
for slug,name,uid,style,abv,ibu,desc,url,rate,count in [
 ('antigua-canchona','Canchona','2541349','Belgian Blonde',6.9,20,'Antigua Brewing 的 Canchona 比利时金色艾尔，酒精度 6.9%、苦度 20 IBU。公开产品介绍描述酒体饱满、带甜味；本图为官网当前罐装包装。','https://static.wixstatic.com/media/2fc18f_6ac8f3f36a254285b0566f1784af3faf~mv2.png',3.32,1395),
 ('antigua-fuego','Fuego','1961523','IPA - American',6.5,57,'Antigua Brewing 的 Fuego IPA，以富埃戈火山命名。公开产品介绍描述其中等酒体及百香果、柑橘香气；酒精度 6.5%、苦度 57 IBU。','https://static.wixstatic.com/media/2fc18f_b54e3f85bbdf4f86bc45b3fbdac02e36~mv2.png',3.44,1938)]:
  b=basebeer('global-wave2-'+slug,name,ab['id'],style,abv,ibu,desc,ev('https://untappd.com/Antigua_Brewing_Company/beer','antigua-untappd.html','public_product_description'));b.update(untappdId=uid,rating=rate,ratingsCount=count,craftStatus='craft_brewery_reference');b.update(picture(slug,url,'https://www.antiguabrewingco.com/es'));b['sourceUrls']+=['https://www.antiguabrewingco.com/es','https://www.antiguabrewingco.com/brewery','https://sites.google.com/view/antiguabrewingcompany/men%C3%BA','https://untappd.com/b/antigua-brewing-co-abc-'+name.lower()+'/'+uid];b['identityEvidence']={'status':'reviewed_same_product','basis':'official individually named can, exact brewery product name and public Untappd ID; no check-in text','untappdId':uid};beers.append(b)
node=ET.parse(E/'adetikope-townhall.xml').getroot().find('node');tags={x.attrib['k']:x.attrib['v'] for x in node.findall('tag')};assert tags=={'amenity':'townhall','name':"Mairie d'Adétikopé"};tu='https://www.openstreetmap.org/node/'+node.attrib['id'];su='https://lasnb.tg/product/show/djama-228'
tb={'id':'global-wave2-snb-adetikope','name':'Société Nouvelle de Boissons (SNB)','city':'Adétikopé','cityZh':'阿德蒂科佩','cityAliases':['Adetikope','Adétikopé','阿德蒂科佩'],'country':'Togo','countryZh':'多哥','countryCode':'TG','countryBasis':'official_local_brewery','lat':float(node.attrib['lat']),'lng':float(node.attrib['lon']),'locationVerified':True,'locationPrecision':'locality_landmark','locationRole':'brewery_locality_reference','locationNote':'官网确认酒厂位于Adétikopé。因未核得聚落中心坐标，地图使用当地市政厅作为明确地标参考；绝不是酒厂精确坐标，也不使用首都或国家中心凑点。','locationSourceUrl':su,'coordinateSourceUrl':tu,'locationEvidence':{'identitySourceUrl':su,'identityEvidenceFile':str((E/'djama228.html').relative_to(R)),'identitySha256':sha(E/'djama228.html'),'coordinateSourceUrl':tu,'coordinateEvidenceFile':str((E/'adetikope-townhall.xml').relative_to(R)),'coordinateSha256':sha(E/'adetikope-townhall.xml'),'coordinateSourcePageId':node.attrib['id'],'coordinatePlaceTitle':tags['name'],'coordinateProvider':'OpenStreetMap','coordinateRole':'locality_town_hall_reference_not_brewery','attribution':'© OpenStreetMap contributors, ODbL','verifiedAt':'2026-10-02'},'sourceUrls':[su,tu],'craftStatus':'industrial_reference','catalog_role':'industrial_reference'};breweries[tb['id']]=tb
for slug,name,style,abv,desc,u,imgurl in [('djama228','Djama 228','Amber Beer',6,'多哥 SNB 的 Djama 228 琥珀啤酒，酒精度 6%。官网列出的原料为水、麦芽与酒花，描述其苦味较明显；以工业品牌参考收录。',su,'https://lasnb.tg/uploads/images/177.png'),('djama-pilsner','Djama Pilsner','Pilsner',5.2,'多哥 SNB 的德式皮尔森，酒精度 5.2%。官网列有水、麦芽与酒花，并提供玻璃瓶和罐装规格；这里展示其官网单瓶包装。','https://lasnb.tg/product/show/djama-pilsner','https://lasnb.tg/uploads/images/4.png')]:
 b=basebeer('global-wave2-'+slug,name,tb['id'],style,abv,None,desc,ev(u,slug+'.html','official_product_description'));b.update(picture(slug,imgurl,u));b.update(craftStatus='industrial_reference',catalog_role='industrial_reference');beers.append(b)
assert len(beers)==19 and len({b['id'] for b in beers})==19
for b in beers:
 assert b['description'] and b['image'] and breweries[b['breweryId']]['locationVerified']
 for k in ['image','imageOriginal','imageThumbnail']:Image.open(P/b[k].lstrip('/')).verify()
 assert np.asarray(Image.open(P/b['image'].lstrip('/')).convert('RGBA'))[:,:,3].min()==0
countries=sorted({breweries[b['breweryId']]['country'] for b in beers});assert len(countries)==10
metadata={'createdAt':'2026-10-02','status':'frozen','newRecords':13,'exactExistingRecordEnrichments':6,'countryCount':10,'countries':countries,'sourcePolicy':'Official pages preferred; BeerTasting/Untappd public product descriptions explicitly labelled community catalogue sources. No user reviews, labels-only, generic barrels or inferred flavors.','locationPolicy':'Nine city references plus one explicitly labelled Adétikopé town-hall locality reference; no precise batch factory claims.','notGlobalCompletion':True,'unsearchedCountriesStatus':'not_searched_in_this_batch, not no_beer'}
payload={'metadata':metadata,'breweries':list(breweries.values()),'beers':beers};(P/'data/global-country-wave2.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n');(O/'image-audit.json').write_text(json.dumps({'images':imageaudit},ensure_ascii=False,indent=2)+'\n');(O/'summary.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
sheet=Image.new('RGB',(1500,1500),(27,40,48));draw=ImageDraw.Draw(sheet)
for i,b in enumerate(beers[-13:]):
 im=Image.open(P/b['image'].lstrip('/')).convert('RGBA');box=b['imageContentBounds']['bounds'];im=im.crop((box['x'],box['y'],box['x']+box['width'],box['y']+box['height']));im.thumbnail((250,430));x=(i%5)*300+(300-im.width)//2;y=(i//5)*500+45;sheet.paste(im,(x,y),im);draw.text(((i%5)*300+8,(i//5)*500+12),b['name'][:32],fill='white')
sheet.save(E/'final-packshots-review.jpg');print(json.dumps({'records':len(beers),'new':13,'enhanced':6,'breweries':len(breweries),'countries':countries},ensure_ascii=False))
