"""Reviewed exact award products; alpha-only masks preserve original bottle RGB."""
import json,hashlib,shutil,copy
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
import numpy as np
R=Path(__file__).resolve().parents[1]; out=R/'public/images/awards-products';out.mkdir(exist_ok=True)
data=json.loads((R/'public/data/curated.json').read_text()); by={str(b.get('untappdId')):b for b in data['beers']}; brs={b['id']:b for b in data['breweries']}
coords={p['title']:p for p in json.loads((R/'.runtime/award-german/coordinates.txt').read_text())['query']['pages']}
config=[
 dict(uid='1789943',slug='wiethaler-weihnachtsfestbier',file='public/images/award-labels/1789943.jpeg',city='Lauf an der Pegnitz',cityZh='劳夫',url='https://untappd.com/b/brauerei-wiethaler-weihnachtsfestbier/1789943',download='https://assets.untappd.com/site/beer_logos_hd/beer-1789943_6d008_hd.jpeg',location='https://untappd.com/w/brauerei-wiethaler/68061',description='深色圣诞节庆啤酒，季节为秋季至新年。酒款公开介绍描述均衡的麦芽组合与柔和的酒花气息。',polygon=[(92,11),(105,11),(109,16),(108,28),(115,46),(122,63),(125,79),(125,168),(121,178),(112,182),(86,182),(79,179),(75,170),(75,80),(77,65),(85,46),(91,28),(91,18)]),
 dict(uid='413640',slug='ketterer-ur-weisse-kristall',file='.runtime/award-german/ketterer-single.png',city='Hornberg',cityZh='霍恩贝格',url='https://www.kettererbier.de/biere/ketterer-ur-weisse-kristall',download='https://www.kettererbier.de/fileadmin/templates/ketterer2019/img/biere/nav/Ketterer_Ur_Weise_kristall.png',location='https://www.kettererbier.de/kontakt',description='清澈的水晶小麦啤酒。酒厂介绍中描述了香蕉、丁香与果香，酒精度为 5.2%。图为官网的低分辨率单瓶缩略图。',polygon=[(61,8),(73,8),(76,12),(75,27),(81,45),(87,65),(90,79),(90,134),(86,146),(80,149),(56,149),(49,145),(47,136),(47,79),(49,65),(56,45),(61,27)]),
 dict(uid='4593120',slug='brauwerk-baden-winterbier',file='.runtime/award-german/baden-winter-original.webp',city='Offenburg',cityZh='奥芬堡',url='https://www.brauwerk-shop.de/products/brauwerk-winterbier-12x0-33l',download='https://cdn.shopify.com/s/files/1/0633/9998/5385/files/winterbier.webp?v=1699360562',location='https://www.brauwerk-shop.de/policies/legal-notice',description='Brauwerk Baden 的季节性 Winter Bier，官方商店展示 0.33 升摇盖瓶装。酒厂位于德国奥芬堡；包装图来自官方商品页。',polygon=[(674,168),(708,163),(788,163),(815,170),(817,187),(810,207),(843,207),(858,220),(876,281),(896,378),(901,410),(894,445),(883,460),(877,481),(866,484),(858,463),(821,477),(843,539),(866,623),(882,691),(918,748),(939,802),(948,838),(950,1254),(943,1287),(927,1311),(907,1326),(857,1337),(795,1342),(686,1342),(627,1335),(590,1322),(570,1301),(557,1274),(552,1249),(550,847),(557,800),(575,758),(605,711),(615,683),(631,596),(654,526),(671,474),(624,462),(623,478),(611,482),(602,457),(595,436),(591,408),(595,378),(635,225),(645,211),(675,209)],holes=[[(652,222),(677,221),(673,235),(660,257),(657,354),(638,356),(624,367),(608,426),(604,409),(608,379)],[(816,221),(839,221),(847,233),(883,389),(886,411),(880,436),(873,414),(862,374),(850,358),(833,354),(830,257)],[(638,373),(656,370),(655,420),(668,434),(666,443),(624,432)],[(836,370),(849,375),(861,414),(862,433),(818,443),(817,434),(836,420)]]),
]
beers=[];breweries={};sheet=Image.new('RGB',(720,420),'#204b57')
for index,c in enumerate(config):
 uid=c['uid'];b=copy.deepcopy(by[uid]);br=copy.deepcopy(brs[b['breweryId']]);src=R/c['file'];im=Image.open(src).convert('RGBA');original=out/(c['slug']+'-original'+src.suffix);shutil.copy2(src,original)
 mask=Image.new('L',im.size);d=ImageDraw.Draw(mask);d.polygon(c['polygon'],fill=255)
 for hole in c.get('holes',[]):d.polygon(hole,fill=0)
 mask=mask.filter(ImageFilter.GaussianBlur(.35));a=np.minimum(np.asarray(mask),np.asarray(im.getchannel('A')));im.putalpha(Image.fromarray(a))
 assert np.array_equal(np.asarray(im)[:,:,:3],np.asarray(Image.open(src).convert('RGBA'))[:,:,:3])
 full=out/(c['slug']+'-cutout.png');im.save(full)
 bbox=im.getchannel('A').point(lambda x:255 if x>16 else 0).getbbox();crop=im.crop(bbox)
 paths={}
 for role,height in [('map',320),('card',800)]:
  thumb=crop.copy();thumb.thumbnail((height,height),Image.Resampling.LANCZOS);canvas=Image.new('RGBA',(thumb.width+12,thumb.height+12));canvas.alpha_composite(thumb,(6,6));p=out/(c['slug']+'-'+role+'.webp');canvas.save(p,'WEBP',quality=93,method=6);paths[role]=p
  if role=='map':bounds={'width':canvas.width,'height':canvas.height,'bounds':dict(zip(['x','y','width','height'],[6,6,thumb.width,thumb.height])),'method':'reviewed_alpha_bbox'}
 review=crop.copy();review.thumbnail((210,375));sheet.paste(review,(index*240+(240-review.width)//2,20),review)
 asset=lambda p:'/images/awards-products/'+p.name
 b.update(image=asset(paths['map']),imageThumbnail=asset(paths['map']),imageOriginal=asset(paths['card']),imageBeforeCutout=asset(original),imageKind='product_packshot',imageDownloadUrl=c['download'],imageSource=c['url'],imageContentBounds=bounds,description=c['description'])
 b['sourceUrls']=list(dict.fromkeys(b.get('sourceUrls',[])+[c['url'],c['location']]))
 b['imageEvidence']={'individuallyVerified':True,'verifiedAt':'2026-10-02','sourceUrl':c['url'],'identity':'Exact product and producer name on real packaging; no logo used as bottle.','sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'packagingYearVerified':False}
 b['imageDerivation']={'method':'manual_reviewed_alpha_mask','original':asset(original),'fullResolutionCutout':asset(full),'rgbPreserved':True,'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'note':'Background/standalone promotional text/reflection removed; original bottle pixels retained.'}
 b['sourceNote']=(b.get('sourceNote') or '')+' 已核对原始瓶身酒名与酒厂，非酒标替代；图片为公开包装参考，包装年份与获奖年度未绑定。'
 if uid=='413640':b['abv']=5.2
 p=coords[c['city']];co=p['coordinates'][0];br.update(city=c['city'],cityZh=c['cityZh'],lat=co['lat'],lng=co['lon'],locationVerified=True,locationPrecision='city',locationRole='brewery_city_reference',locationSourceUrl=c['location'],coordinateSourceUrl='https://en.wikipedia.org/wiki/'+c['city'].replace(' ','_'),locationNote='官方酒厂所在城市参考位置，不代表精确生产厂址。')
 br['sourceUrls']=list(dict.fromkeys(br.get('sourceUrls',[])+[c['location'],br['coordinateSourceUrl']]))
 br['locationEvidence']={'verifiedAt':'2026-10-02','identitySourceUrl':c['location'],'coordinateSourceUrl':br['coordinateSourceUrl'],'coordinateSourcePageId':p['pageid'],'coordinateEvidenceFile':'.runtime/award-german/coordinates.txt','productionLocationVerified':False}
 beers.append(b);breweries[br['id']]=br
sheet.save(R/'.runtime/award-german/cutout-review.jpg')
(R/'research/award-country-expansion-2026-10-02/german-award-products.json').write_text(json.dumps({'metadata':{'createdAt':'2026-10-02','method':'Exact real product packaging and brewery-city evidence; alpha-only cuts'},'beers':beers,'breweries':list(breweries.values())},ensure_ascii=False,indent=2)+'\n')
print('3 German award packshots ready')
