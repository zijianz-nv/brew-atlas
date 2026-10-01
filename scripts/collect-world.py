#!/usr/bin/env python3
"""Reproduce the curated world fixture without accounts or API keys.
Facts are concise, manually verified summaries of the source URLs. Images use
Wikimedia Commons' own author/license metadata. No product photo is fabricated.
Run from any directory: python3 scripts/collect-world.py [--refresh-images]
"""
import concurrent.futures, html, json, pathlib, re, sys, urllib.parse, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
UA = {'User-Agent': 'BrewAtlasLocalDemo/0.1 (public educational prototype; Commons attribution retained)'}
def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)

def brewery(id, name, zh, country, czh, city, lat, lng, page, website, description, precision='brewery', year=None, extras=[]):
    return dict(id=id,name=name,nameZh=zh,country=country,countryZh=czh,city=city,lat=lat,lng=lng,locationPrecision=precision,year=year,website=website,description=description,sourceUrls=[website,page]+extras)
WIKI='https://en.wikipedia.org/wiki/'
breweries=[
 brewery('sierra-nevada','Sierra Nevada Brewing Co.','内华达山脉','United States','美国','Chico',39.72333333,-121.81583333,WIKI+'Sierra_Nevada_Brewing_Company','https://sierranevada.com/brews/pale-ale','从加州 Chico 起步，以 Cascade 酒花的松针与柑橘香塑造美式淡色艾尔。此处标记 Chico 酒厂，并不推定每瓶酒的生产厂。',year=1980),
 brewery('duvel-moortgat','Duvel Moortgat','督威','Belgium','比利时','Breendonk',51.041996,4.32871,WIKI+'Duvel_Moortgat_Brewery','https://www.duvel.com/en/contact-us','位于 Breendonk 的比利时酒厂，代表作以瓶中二次发酵和长时间熟成形成细密气泡。',year=1871,extras=['https://www.duvel.com/en/the-beer/duvel']),
 brewery('chimay','Chimay Brewery','智美修道院','Belgium','比利时','Chimay',49.98194444,4.3375,WIKI+'Chimay_Brewery','https://chimay.com/us/discover-chimay/','Scourmont 修道院的酿造传统始于 1862 年。红帽和蓝帽展现果香、焦糖与巧克力等不同层次。',year=1862),
 brewery('weihenstephan','Bayerische Staatsbrauerei Weihenstephan','维森巴伐利亚州立酒厂','Germany','德国','Freising',48.39611111,11.72916667,WIKI+'Bayerische_Staatsbrauerei_Weihenstephan','https://www.weihenstephaner.de/unsere-biere/hefeweissbier','弗赖辛 Weihenstephan 山上的巴伐利亚酒厂，麦香、香蕉和丁香香构成其经典小麦啤酒的风味。'),
 brewery('guinness','Guinness · St. James’s Gate','吉尼斯圣詹姆斯门酒厂','Ireland','爱尔兰','Dublin',53.34444444,-6.28888889,WIKI+'Guinness_Brewery','https://www.guinness.com/en-gb/beers/guinness-draught','都柏林的世涛风格地标，Draught 在 1959 年问世。收录为世界风格参照，不代表独立精酿认证。'),
 brewery('pilsner-urquell','Pilsner Urquell Brewery','皮尔森之源','Czechia','捷克','Plzeň',49.74666667,13.38722222,WIKI+'Pilsner_Urquell_Brewery','https://www.pilsnerurquell.com/','Plzeň 的金色拉格以本地麦芽、Saaz 酒花和软水酿造，延续三次糖化煮出传统。收录为风格参照，不代表独立精酿认证。',year=1842),
 brewery('lindemans','Lindemans Brewery','林德曼','Belgium','比利时','Vlezenbeek',50.81579,4.21229,WIKI+'Lindemans_Brewery','https://lindemans.be/fr-be/pages/lindemans-kriek','以 Lambic 和水果啤酒闻名的比利时酒厂。Kriek 将酸樱桃与 Lambic 结合，平衡果甜和酸度。'),
 brewery('kiuchi','Kiuchi Brewery · Hitachino Nest','木内酒造 · 常陆野猫头鹰','Japan','日本','Naka, Ibaraki',36.45738889,140.48675,WIKI+'Naka,_Ibaraki','https://kiuchibrewery.co.jp/en/products/beer/','茨城县那珂市的木内酒造将本地食材带入常陆野啤酒。红米艾尔使用古代米 Asamurasaki。地点为那珂市中心，非精确厂址。',precision='city',extras=['https://kiuchibrewery.co.jp/en/news/2024-10-28/']),
 brewery('coopers','Coopers Brewery','库珀酒厂','Australia','澳大利亚','Regency Park, Adelaide',-34.8726,138.5731,WIKI+'Coopers_Brewery','https://coopers.com.au/pages/how-to-find-us','阿德莱德 Regency Park 酒厂延续自然熟成传统，瓶、罐与桶中二次发酵带来细腻浑浊感。',extras=['https://coopers.com.au/products/original-pale-ale']),
 brewery('stone','Stone Brewing','巨石酿酒','United States','美国','Escondido, California',33.12472222,-117.08083333,WIKI+'Escondido,_California','https://www.stonebrewing.com/beer/year-round-releases/stone-fearmovielions-hazy-double-ipa','从加州出发的酒花风格酒厂，Fear.Movie.Lions 融合东西海岸 IPA 的表达。标记为 Escondido 城市中心，非酒款精确生产地址。',precision='city'),
]

def beer(id,name,brewery_id,style,style_zh,abv,ibu,description,original,flavors,source,title,**extras):
    x=dict(id=id,name=name,breweryId=brewery_id,style=style,styleZh=style_zh,abv=abv,ibu=ibu,srm=None,description=description,originalDescription=original,flavors=flavors,hops=[],malts=[],yeast=None,foodPairings=[],firstBrewed=None,image='/images/world-'+id+'.jpg',imageCredit='',imageSource='',sourceUrls=[source],sourceNote='风味为酒厂原文的人工中文摘要；参数取所列官方资料，缺失项留空。照片可能为历史包装。',collection='world',_commonsTitle=title)
    x.update(extras);return x
PRESS='https://chimay.com/wp-content/uploads/2020/12/6299-Communique%CC%81-de-presse-EN.pdf'
beers=[
 beer('sierra-pale','Sierra Nevada Pale Ale','sierra-nevada','American Pale Ale','美式淡色艾尔',5.6,38,'Cascade 酒花带来明亮的柑橘与松针香，焦糖麦芽让苦味有温柔的落点。瓶中熟成赋予酒体细腻气泡。','Intense aromas of pine and citrus, balanced by smooth caramel malt.',['柑橘','松针','焦糖'],'https://sierranevada.com/brews/pale-ale','File:Sierra Nevada Pale Ale (cropped).jpg',hops=['Cascade'],malts=['Caramelized','Two-row Pale'],yeast='Ale',firstBrewed='1980'),
 beer('duvel','Duvel','duvel-moortgat','Belgian Golden Strong Ale','比利时金色烈性艾尔',8.5,None,'轻盈果香、干爽收尾与细密气泡并存；斯洛文尼亚和捷克酒花带来清晰而细致的苦韵。','Slightly fruity, dry aroma, well hopped, with a slightly bitter aftertaste.',['果香','清爽'],'https://www.duvel.com/en/the-beer/duvel','File:Duvel..jpg',hops=['Saaz-Saaz','Styrian Golding'],malts=['Barley malt'],yeast='Duvel house yeast'),
 beer('chimay-blue','Chimay Blue / Grande Réserve','chimay','Belgian Dark Strong Ale','比利时深色烈性艾尔',9,None,'深棕色酒体中，浓郁果香与巧克力、香料交织。蓝帽适合观察比利时深色艾尔的熟成潜力。','A luscious fruity bouquet and delicious chocolate.',['果香','巧克力','香料'],PRESS,'File:Chimay bleu.jpg',sourceUrls=[PRESS,'https://chimay.com/cadeaux/?lang=en']),
 beer('chimay-red','Chimay Red / Première','chimay','Belgian Dubbel','比利时双料艾尔',7,None,'智美红帽以慷慨的果香与太妃糖气息形成平衡，是该酒厂历史较早的代表酒款。','Generous fruity flavours and toffee.',['果香','焦糖'],PRESS,'File:Chimay Rouge.JPG'),
 beer('weihen-hefe','Weihenstephaner Hefeweißbier','weihenstephan','Hefeweizen','德式小麦白啤',5.4,14,'天然浑浊的琥珀色小麦啤酒，香蕉和丁香香十分鲜明，口感柔滑，带少许香料气息。','Duftet nach Gewürznelken und besticht durch sein feines Bananenaroma.',['香蕉','丁香','香料'],'https://www.weihenstephaner.de/unsere-biere/hefeweissbier','File:Weihenstephaner Hefe Weissbier.JPG',malts=['Barley malt','Wheat malt']),
 beer('weihen-dunkel','Weihenstephaner Hefeweißbier Dunkel','weihenstephan','Dunkelweizen','德式深色小麦啤',5.3,14,'栗棕色酒体带有轻柔焦糖、熟香蕉与麦芽香，气泡活泼而入口绵柔。','A pleasantly light caramel note is perceptible in the flavor.',['焦糖','香蕉','麦香'],'https://www.weihenstephaner.de/en/our-beers/dark-wheat-beer-1','File:Weihenstephaner Hefeweissbier Dunkel.JPG',foodPairings=['烤猪肉','甜点']),
 beer('guinness','Guinness Draught','guinness','Irish Dry Stout','爱尔兰干世涛',4.2,None,'烘烤大麦带来咖啡与巧克力香，酒体顺滑，苦、甜与烘烤感保持平衡，表面覆盖奶油般细密泡沫。','Hints of roasted coffee and chocolate.',['烘烤','咖啡','巧克力'],'https://www.guinness.com/en-gb/beers/guinness-draught','File:Guinness Draught.jpg',malts=['Malted barley'],firstBrewed='1959',sourceNote='4.2% 采用英国官方产品版本；不同市场和包装可能不同。此酒为世涛风格参照，不表示独立精酿认证。'),
 beer('urquell','Pilsner Urquell','pilsner-urquell','Czech Pilsner','捷克皮尔森',4.4,None,'三次煮出糖化的麦芽甜感与 Saaz 酒花苦韵互相平衡，带淡淡焦糖，收尾清爽干净。','Subtle caramel tones and a clean finish with a pleasing, hoppy bitterness.',['焦糖','麦香','清爽'],'https://www.pilsnerurquell.com/','File:Pilsner Urquell 330mL Bottle.jpg',hops=['Saaz'],malts=['Moravian barley malt'],firstBrewed='1842',sourceUrls=['https://www.pilsnerurquell.com/','https://www.asahideutschland.de/unsere-marken/pilsner-urquell'],sourceNote='风味来自酒厂官网，ABV 来自品牌母公司德国官网。收录为皮尔森风格参照，不表示独立精酿认证。'),
 beer('lindemans-kriek','Lindemans Kriek','lindemans','Fruit Lambic','樱桃兰比克',3.5,None,'鲜明酸樱桃香中有淡淡杏仁，红色酒体与粉色泡沫将水果的甜润和 Lambic 的酸爽连接起来。','Un équilibre parfaitement maîtrisé entre douceur et acidité.',['樱桃','酸爽','杏仁'],'https://lindemans.be/fr-be/pages/lindemans-kriek','File:Lindemans - Kriek + bottle Studio Wauters LR 02.jpg',firstBrewed='1979',foodPairings=['山羊奶酪','巧克力甜点']),
 beer('hitachino-red','Hitachino Nest Red Rice Ale','kiuchi','Red Rice Ale','红米艾尔',7,11,'采用古代红米 Asamurasaki，呈淡红色。柔和苦味、鲜明果香和适度酸感，构成常陆野独特的米酿表达。','A fruity aroma reminiscent of fruit, and just the right amount of acidity.',['果香','酸爽'],'https://kiuchibrewery.co.jp/en/products/beer/list/red-rice-ale/','File:Hitachino Red Rice Ale (2970235314).jpg',srm=8.8,malts=['Malt'],sourceNote='官方参数：7% ABV、11 IBU、8.8 SRM。配料另含 Asamurasaki 红米；地图只精确到那珂市。'),
 beer('coopers-pale','Coopers Original Pale Ale','coopers','Australian Pale Ale','澳式淡色艾尔',4.5,26,'果香和花香在清脆苦味中保持平衡。自然熟成带来轻微浑浊，以及具有辨识度的酵母果香。','Fruity and floral characters, balanced with a crisp bitterness.',['果香','花香','清爽'],'https://coopers.com.au/products/original-pale-ale','File:COOPERS PALE ALE FROM ADELAIDE AUSTRALIA IN THE BIER GARDEN SAIGON VIETNAM JAN 2012 (6964050205).jpg',sourceNote='IBU 26 采用当前酒厂官网；旧产品单中的数值不同，照片为历史包装。'),
 beer('stone-fml','Stone ///Fear.Movie.Lions Hazy Double IPA','stone','Hazy Double IPA','浑浊双倍 IPA',8.5,60,'Loral 与 Mosaic 酒花呈现草莓、蓝莓、葡萄和些许菠萝香。果汁般酒体，以适中的西海岸式苦韵收尾。','Fresh-squeezed fruit juice, strawberry, blueberry, grapes and a hint of white sage.',['莓果','热带水果','果香'],'https://www.stonebrewing.com/beer/year-round-releases/stone-fearmovielions-hazy-double-ipa','File:Fear.Movie.Lions IPA.jpg',hops=['Loral','Mosaic'],foodPairings=['泰式炒河粉','草莓芭菲'],firstBrewed='2018-06-04'),
]

def clean(value):return re.sub('<[^>]+>','',html.unescape(value)).strip()
def collect(beer):
    params=dict(action='query',format='json',titles=beer['_commonsTitle'],prop='imageinfo',iiprop='url|extmetadata',iiurlwidth=500)
    data=get_json('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params))
    info=next(iter(data['query']['pages'].values()))['imageinfo'][0]
    meta=info['extmetadata']; author=clean(meta.get('Artist',{}).get('value',''))
    license_name=meta.get('LicenseShortName',{}).get('value','')
    assert author and license_name, 'Missing Commons author/license'
    beer['imageCredit']=author+' · '+license_name
    beer['imageSource']=info['descriptionurl']
    beer['imageLicenseUrl']=meta.get('LicenseUrl',{}).get('value','')
    beer['imageDownloadUrl']=info.get('thumburl',info['url']).split('?')[0]
    p=ROOT/'public'/beer['image'].lstrip('/')
    if '--refresh-images' in sys.argv or not p.exists():
        with urllib.request.urlopen(urllib.request.Request(beer['imageDownloadUrl'],headers=UA),timeout=30) as response: content=response.read()
        assert content.startswith(b'\xff\xd8') or content.startswith(b'\x89PNG'), 'Unexpected image format'
        p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(content)
    assert p.stat().st_size>1000
    beer.pop('_commonsTitle',None)
    return beer

def main():
    images=ROOT/'public/images';images.mkdir(parents=True,exist_ok=True)
    results=list(concurrent.futures.ThreadPoolExecutor(max_workers=3).map(collect,beers))
    dest=ROOT/'public/data/world.json';dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps({'breweries':breweries,'beers':results},ensure_ascii=False,indent=2)+'\n')
    print(f'Wrote {len(breweries)} breweries, {len(results)} beers, {len(set(x["country"] for x in breweries))} countries to {dest}')
if __name__=='__main__':main()
