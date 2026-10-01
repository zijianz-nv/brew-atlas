#!/usr/bin/env python3
"""Add 19 verified beers / 12 brewery brands to the original world fixture.
Run after collect-world.py. Idempotent; preserves unrelated existing records.
Public producer facts + Commons image metadata, no accounts or keys.
"""
import concurrent.futures, importlib.util, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('world_base',ROOT/'scripts/collect-world.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
brewery=base.brewery;beer=base.beer;W='https://en.wikipedia.org/wiki/'
U='https://www.unibroue.com/en-us/beers/classics/'
L='https://it.latrappetrappist.com/it/it/le-nostre-birre/prodotti/birra/la-trappe-'
J='https://www.brouwerijhetij.nl/en/our-beers/'
V='https://www.vinmonopolet.no/'
OM='https://omnipollo.com/products/marbles'
CO='https://rizatti.com.br/nossas-marcas/cervejas/cervejaria-colorado/colorado-appia'
RO='https://www.rodenbach.be/content/dam/rodenbach/het-foederhuis/Foederhuis%20Menu%20-%20ENG.pdf/_jcr_content/renditions/original.media_file.download_attachment.file/Foederhuis%20Menu%20-%20ENG.pdf'
NIPA=V+'Land/Norge/N%C3%B8gne-%C3%98-India-Pale-Ale/p/1336802'
NSAI=V+'Land/Norge/Agder/Grimstad/N%C3%B8gne-%C3%98-Saison/p/7906702'
UNIPA='https://www.unibroue.com/en-ca/beers/classics/ce-nest-pas-la-fin-du-monde'
B=[
 brewery('unibroue','Unibroue','优尼堡','Canada','加拿大','Chambly, Québec',45.45,-73.28333333,W+'Chambly,_Quebec',UNIPA,'魁北克 Chambly 的比利时风格酒厂，以瓶罐内熟成、小麦白啤和高发酵艾尔见长。地图采用城市中心，非精确生产厂址。',precision='city'),
 brewery('la-trappe','Brouwerij de Koningshoeven · La Trappe','康宁斯胡芬 · La Trappe','Netherlands','荷兰','Berkel-Enschot',51.54355,5.12661667,W+'De_Koningshoeven_Brewery',L+'blond.html','荷兰 Berkel-Enschot 修道院的 La Trappe，从金色 Blond 到深色 Quadrupel 展示酵母、麦芽与果香的多种组合。'),
 brewery('brouwerij-ij',"Brouwerij ’t IJ",'阿姆斯特丹 IJ 酒厂','Netherlands','荷兰','Amsterdam',52.36666667,4.92638889,W+"Brouwerij_%27t_IJ",J+'zatte-tripel','阿姆斯特丹风车旁的酒厂，1985 年以 Zatte 起步。小麦、香料和酒花各有鲜明表达。',year=1985),
 brewery('nogne-o','Nøgne Ø','裸岛酒厂','Norway','挪威','Grimstad',58.3405,8.5934,W+'Grimstad_(town)','https://www.nogne-o.no/kontakt','挪威 Grimstad 的酒厂，IPA 与 Saison 展示酒花和酵母带来的不同层次。地图采用城市中心，官方厂址为 Lunde 8。',precision='city'),
 brewery('mikkeller','Mikkeller','米凯乐','Denmark','丹麦','Copenhagen',55.67611111,12.56833333,W+'Copenhagen','https://www.mikkeller.com/events/beer-geek-breakfast','源自哥本哈根的啤酒品牌，以咖啡世涛和跨厂合作闻名。此处标记总部城市中心；酒款可能由其他国家的合作酒厂酿造。',precision='city',extras=['https://www.mikkeller.com/how-it-all-started','https://www.mikkeller.com/news/new-beer-geek-breakfast-can-ready']),
 brewery('colorado','Cervejaria Colorado','科罗拉多酒厂','Brazil','巴西','Ribeirão Preto',-21.17833333,-47.80666667,W+'Ribeir%C3%A3o_Preto','https://www.cervejariacolorado.com.br/','巴西 Ribeirão Preto 的酒厂，将本地食材引入啤酒，Appia 使用橙花蜂蜜。地点为城市中心；收录不代表独立精酿认证。',precision='city',year=1996,extras=['https://www.ribeiraopreto.sp.gov.br/portal/pdf/cultura849.pdf',CO]),
 brewery('omnipollo','Omnipollo','欧米波罗','Sweden','瑞典','Sundbyberg',59.36666667,17.96666667,W+'Sundbyberg_Municipality','https://omnipollo.com/pages/contact','瑞典啤酒品牌，在 Sundbyberg 设有教堂酒厂。地图采用品牌所在城市中心；此处 Marbles 官方注明在比利时 De Proefbrouwerij 酿造。',precision='city',extras=[OM]),
 brewery('orval-brewery','Brasserie d’Orval','奥瓦修道院酒厂','Belgium','比利时','Villers-devant-Orval',49.63944444,5.34861111,W+'Orval_Brewery','https://www.orval.be/en/page/447-orval-brewery','位于 Orval 修道院内的酒厂，始于 1931 年，以高发酵、熟成和酒花创造鲜明果香与苦韵。',year=1931),
 brewery('chouffe-brewery','Brasserie d’Achouffe','小精灵酒厂','Belgium','比利时','Achouffe',50.1509,5.7456,W+'Brasserie_d%27Achouffe','https://chouffe.com/fr-fr/nos-bieres/la-chouffe','比利时阿登地区 Achouffe 的酒厂，小精灵标签下的金色艾尔以清新柑橘、花香和香料气息见长。'),
 brewery('rodenbach','Brouwerij Rodenbach','罗登巴赫','Belgium','比利时','Roeselare',50.946495,3.13761,W+'Rodenbach_Brewery','https://www.rodenbach.be/','Roeselare 的红色艾尔传统，以橡木大桶熟成带出酸甜果香和悠长余韵。',extras=[RO]),
 brewery('dupont','Brasserie Dupont','杜邦酒厂','Belgium','比利时','Tourpes',50.571989,3.650757,W+'Dupont_Brewery','https://www.brasserie-dupont.com/saison-dupont/','Tourpes 的农场酒厂延续 Saison 传统，用葡萄柚、丁香、麦芽和干爽收尾展现季节啤酒的轮廓。'),
 brewery('st-bernardus','Brouwerij St. Bernardus','圣伯纳德酒厂','Belgium','比利时','Watou',50.86666667,2.61666667,W+'Watou','https://www.sintbernardus.be/en/brewery/our-beers/stbernardus-abt-12-en','Watou 酒厂以 Abt 12 四料艾尔为代表，强调酵母果香和绵长苦甜平衡。地图采用城市中心，非精确厂址。',precision='city'),
]
E=[
 beer('unibroue-fin-monde',"Unibroue Ce n’est pas La Fin du Monde",'unibroue','Belgian IPA','比利时 IPA',9.5,50,'比利时三料的酵母层次与新世界 IPA 酒花结合，桃子、热带水果、丁香和树脂苦韵交织，收尾有温暖酒精感。','Cereal, tropical and stone fruit, cloves, sweet pepper, boreal, herbaceous and resinous bitterness.',['热带水果','果香','丁香','香料'],UNIPA,'File:Tallboy can of La Fin Du Monde by Unibroue.jpg',srm=5.5,hops=['Galaxy','Willamette','Cascade','Simcoe'],foodPairings=['香辣鱼肉塔可','菠萝蛋糕','熟成切达奶酪'],sourceNote='所收录为 Ce n’est pas La Fin du Monde，9.5% Belgian IPA；不是经典 La Fin du Monde 9% Tripel。Commons 文件名较简略，以图片标签和酒厂官网核对。'),
 beer('unibroue-maudite','Unibroue Maudite','unibroue','Belgian Dubbel','比利时双料艾尔',8,22,'焦糖化糖与橘子酱般的柔滑入口，伴随轻微烘烤感，尾段带丁香等香料气息。','Velvety palate of caramelized sugar and marmalade, slightly roasted with a spicy finish.',['焦糖','柑橘','烘烤','香料'],U+'maudite','File:Tallboy can of "Maudite" by Unibroue.jpg',srm=18),
 beer('unibroue-blanche','Unibroue Blanche de Chambly','unibroue','Witbier','比利时小麦白啤',5,10,'小麦、橙子与香料气息清新交织，甜感和酸度平衡，蜂蜜般的余韵柔和收尾。','Notes of wheat, orange and spices, good sugar/acidity balance, honey finish.',['麦香','柑橘','香料','蜂蜜'],U+'blanche-de-chambly','File:Can of Blanche Chambly by Unibroue.jpg',srm=4,foodPairings=['白肉鱼','沙拉','山羊奶酪']),
 beer('latrappe-quad','La Trappe Quadrupel','la-trappe','Belgian Quadrupel','修道院四料艾尔',10,None,'浓郁麦芽中有椰枣、无花果与焦糖气息，丁香、香草和坚果香让深色酒体更具层次。','Maltata con dolci note di datteri, fichi e caramello.',['焦糖','果干','丁香','麦香'],L+'quadrupel.html','File:Latrappequadrupel.jpg'),
 beer('latrappe-tripel','La Trappe Tripel','la-trappe','Belgian Tripel','修道院三料艾尔',8,None,'桃子、杏子与花香构成上扬香气，入口饱满柔和，麦芽和糖果甜感由尾段轻苦收住。','Fruttato con aromi di pesca e albicocca, combinati con note floreali.',['果香','花香','麦香'],L+'tripel.html','File:Latrappetripel.jpg',malts=['Barley malt']),
 beer('latrappe-blond','La Trappe Blond','la-trappe','Belgian Blond Ale','修道院金色艾尔',6.5,None,'清新果香和柑橘气息与甜麦芽融合，略带香料，轻微甜感与细致苦韵保持平衡。','Un sapore delicatamente dolce, lievemente amaro e maltato.',['果香','柑橘','麦香','香料'],L+'blond.html','File:LaTrappeTrappistBlond.jpg',malts=['Pale barley malt','Munich malt'],foodPairings=['清淡鱼料理','禽肉','年轻软奶酪']),
 beer('ij-zatte',"Brouwerij ’t IJ Zatte Tripel",'brouwerij-ij','Belgian Tripel','三料艾尔',8,None,'酒厂 1985 年的第一款啤酒。金色酒体带麦香、果香与香料，入口稍甜，尾段顺滑干爽。','Malty, Spicy, Fruity, Bitter.',['麦香','香料','果香'],J+'zatte-tripel',"File:'t IJ Zatte Tripel.jpg",firstBrewed='1985',malts=['Barley malt']),
 beer('ij-ipa',"Brouwerij ’t IJ IPA",'brouwerij-ij','American IPA','美式 IPA',6.5,None,'突出的酒花香带来葡萄柚和花香，入口果香鲜明，以清晰苦韵收尾。','Aromas of grapefruit and flowers.',['柑橘','花香','果香'],J+'ipa',"File:Brouwerij 't IJ I.P.A. (old design).jpg",sourceNote='ABV 6.5% 采用当前酒厂产品页；本地照片为旧标签，显示 7%。两者是不同时间版本，不把旧照片当作当前包装。'),
 beer('ij-wit',"Brouwerij ’t IJ IJwit",'brouwerij-ij','Witbier','小麦白啤',6.5,None,'小麦麦芽、柠檬和芫荽籽带来清新而饱满的口感，果香与香料气息十分鲜明。','Wheat malt, lemon and coriander seed.',['麦香','柑橘','香料','清爽'],J+'ijwit',"File:Brouwerij 't IJ IJwit (bottle).jpg",malts=['Barley malt','Wheat malt']),
 beer('nogne-ipa','Nøgne Ø India Pale Ale','nogne-o','American IPA','美式 IPA',7.5,60,'饱满柔滑，酒花苦味清晰；浅色与轻度烘烤麦芽中带柑橘、草本和些许松针气息。','Fyldig og kremet med tydelig humlebitterhet, lyst og litt røstet malt, svale urter og sitrus.',['柑橘','麦香','松针','烘烤'],NIPA,'File:Nogne o ipa.jpg',sourceUrls=[NIPA,'https://www.nogne-o.no/vare-ol/india-pale-ale'],malts=['Barley malt','Wheat malt'],sourceNote='ABV 与风味采用挪威国营酒类零售商 Vinmonopolet 的产品品评；IBU 60 采用酒厂官网。'),
 beer('nogne-saison','Nøgne Ø Saison','nogne-o','Saison','赛松农舍艾尔',6.5,None,'明亮果香中有柑橘、苹果与草本气息，淡麦芽和花香相随，余味悠长。','Lyst og fruktig, preg av sitrus, eple og urter, ettersmak med god lengde.',['柑橘','果香','麦香','花香'],NSAI,'File:Nogne o saison.jpg',malts=['Barley malt','Wheat malt'],sourceNote='参数与风味来自 Vinmonopolet 产品页，采用其 6.5% 版本。照片是历史包装，不据旧照片推定当前参数。'),
 beer('mikkeller-breakfast','Mikkeller Beer Geek Breakfast','mikkeller','Oatmeal Coffee Stout','燕麦咖啡世涛',7.5,None,'浓缩咖啡、黑巧克力和焦糖香融合，口感柔滑绵密，尾段保留平衡苦味。','Balanced Stout beer with notes of espresso, dark chocolate and caramel.',['咖啡','巧克力','焦糖'],'https://faergekroen.mikkeller.com/drinks','File:Beergeekbreakfast glas.jpg',sourceUrls=['https://faergekroen.mikkeller.com/drinks','https://www.mikkeller.com/how-it-all-started','https://www.mikkeller.com/news/new-beer-geek-breakfast-can-ready'],sourceNote='7.5% 与风味取 Mikkeller 自营餐厅菜单；地图表示丹麦品牌总部城市，非这瓶酒的生产地。2017 年罐装版本官方说明在挪威 Lervig 酿造。照片是历史瓶装。'),
 beer('colorado-appia','Colorado Appia','colorado','Honey Wheat Ale','蜂蜜小麦艾尔',5.5,10,'橙花蜂蜜与大麦、小麦麦芽结合，入口甜润饱满而清爽，适合观察巴西本地食材的表达。','Doce, encorpada e refrescante.',['蜂蜜','麦香','清爽'],CO,'File:Colorado Appia (8472282044).jpg',malts=['Barley malt','Wheat malt'],foodPairings=['沙拉','鸡肉','布里奶酪'],sourceNote='5.5% ABV、10 IBU 和风味采用品牌经销商 Rizatti 产品页；Commons 为历史包装，旧图说明提及 4.5% 版本，不与当前参数混同。'),
 beer('omnipollo-marbles','Omnipollo Marbles','omnipollo','American Pale Ale','美式淡色艾尔',5.3,None,'以 Nelson Sauvin、Galaxy 和 Citra 酒花酿造，酒厂将其描述为容易饮用的美式淡色艾尔，呈现直接的酒花表达。','Easy drinking American Pale Ale brewed with Nelson Sauvin, Galaxy and Citra hops.',['清爽','酒花'],OM,'File:Omnipollo Marbles.jpg',hops=['Nelson Sauvin','Galaxy','Citra'],sourceNote='地图按瑞典品牌所在地展示；这款 Marbles 的官方产品页明确写明在比利时 De Proefbrouwerij 酿造。配图是实际产品罐身，图案作者 Tobias Lund，照片许可与品牌包装权利分别处理。'),
 beer('orval','Orval','orval-brewery','Belgian Pale Ale','比利时淡色艾尔',6.2,None,'高发酵与熟成形成鲜明果香，饱满复杂的口感和酒花苦韵保持细致平衡。','The distinctive fruity and bitter taste of Orval beer.',['果香','酒花'],'https://www.orval.be/en/page/447-orval-brewery','File:Orval beer bottle (2011).png',image='/images/world-orval.png',sourceUrls=['https://www.orval.be/en/page/447-orval-brewery',W+'Orval_Brewery'],firstBrewed='1931',sourceNote='风味来自修道院官网；ABV 6.2% 采用常规欧洲标签版本及百科产品资料。北美标签可能标 6.9%，并非统一全球参数。'),
 beer('chouffe','La Chouffe','chouffe-brewery','Belgian Blond Ale','比利时金色艾尔',8,None,'金色酒体带来清新的柑橘与花香，尾段有舒适的香料气息。','Notes d’agrumes, suivies d’une touche agréablement épicée.',['柑橘','花香','香料'],'https://chouffe.com/fr-fr/nos-bieres/la-chouffe','File:La Chouffe bottle.jpg',foodPairings=['禽肉','烟熏三文鱼','贻贝']),
 beer('rodenbach-grand','Rodenbach Grand Cru','rodenbach','Flanders Red Ale','弗兰德斯红艾尔',6,None,'在橡木大桶中熟成，形成复杂酸甜果香与悠长尾韵，是探索红色酸艾尔的风格样本。','Complex sweet-sour fruitiness, long aftertaste, aged in oak foeders.',['酸爽','果香','木桶'],RO,'File:Rodenbach grand cru bottle.jpg'),
 beer('dupont-saison','Saison Dupont','dupont','Saison','赛松农舍艾尔',6.5,None,'葡萄柚、白色水果与丁香香清晰，入口有麦芽层次，苦味鲜明，收尾干爽。','Fragrances de pamplemousse, et d’épices (girofle).',['柑橘','丁香','麦香','香料'],'https://www.brasserie-dupont.com/saison-dupont/','File:Saison Dupont.jpg',firstBrewed='1844',foodPairings=['贻贝','芦笋','亚洲料理']),
 beer('bernardus-abt','St. Bernardus Abt 12','st-bernardus','Belgian Quadrupel','比利时四料艾尔',10,None,'酒厂自有酵母带来浓郁果香，深色酒体柔和饱满，复杂味道以悠长苦甜余韵收尾。','A very fruity aroma that is the result of using our own unique yeast.',['果香'],'https://www.sintbernardus.be/en/brewery/our-beers/stbernardus-abt-12-en','File:Stbernardusabt.jpg',yeast='St. Bernardus house yeast',foodPairings=['炖牛肉','蓝纹奶酪','巧克力'],sourceNote='ABV 10% 采用酒厂官网；官网以 EBU 20、EBC 70 标注苦度和色度，此处不擅自换写 IBU/SRM，故保留空值。'),
]
def collect(x):
    out=base.collect(x)
    if out['id']=='dupont-saison':
        # Commons metadata chooses PD-self, but the file page also explicitly
        # offers CC BY-SA 3.0 in its Permission field. Retain that named option.
        out['imageCredit']='Jmcstrav · CC BY-SA 3.0 (also public domain dedication)'
        out['imageLicenseUrl']='https://creativecommons.org/licenses/by-sa/3.0'
    return out

def main():
    dest=ROOT/'public/data/world.json'
    if not dest.exists():base.main()
    data=json.loads(dest.read_text())
    photos=list(concurrent.futures.ThreadPoolExecutor(max_workers=3).map(collect,E))
    for key,items in [('breweries',B),('beers',photos)]:
        merged={x['id']:x for x in data[key]};merged.update({x['id']:x for x in items});data[key]=list(merged.values())
    dest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f'World: {len(data["beers"])} beers, {len(data["breweries"])} breweries/brands, {len(set(x["country"] for x in data["breweries"]))} countries')
if __name__=='__main__':main()
