#!/usr/bin/env python3
"""Import a bounded OFF photo catalog from preserved official public product rows.
No account, generated images, flavor inference or sales-country geocoding.
"""
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import argparse, hashlib, importlib.util, json, math, re, shutil, struct, threading, time, urllib.request

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.runtime/off'
OUT=ROOT/'public/data/off.json'
SOURCE=ROOT/'public/data-sources/off'
IMAGES=ROOT/'public/images/off'
AWS='https://openfoodfacts-images.s3.eu-west-3.amazonaws.com/data/'
CDN='https://images.openfoodfacts.org/images/products/'
CC='https://creativecommons.org/licenses/by-sa/3.0/'
LICENSE='https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/'
HF='https://huggingface.co/datasets/openfoodfacts/product-database'
OFF='https://world.openfoodfacts.org'
SEARCH='https://search.openfoodfacts.org'
UA='BrewAtlasPhotoDemo/1.3 (local noncommercial prototype; bounded image import)'
cdn_lock=threading.Lock()
spec=importlib.util.spec_from_file_location('off_matching',ROOT/'scripts/off-matching.py')
matching=importlib.util.module_from_spec(spec);spec.loader.exec_module(matching)

STYLES=[('en:non-alcoholic-beers','Alcohol-free Beer','无醇啤酒'),('en:new-england-ipa','New England IPA','新英格兰 IPA'),('en:hazy-ipa','Hazy IPA','浑浊 IPA'),('en:double-ipa','Double IPA','双倍 IPA'),('en:session-ipa','Session IPA','轻饮型 IPA'),('ca:cervesa-ipa','IPA','印度淡色艾尔 IPA'),('en:triple-ales','Tripel','三料啤酒'),('en:sour-beers','Sour Beer','酸啤酒'),('en:lambic-beers','Lambic','兰比克'),('en:pale-ales','Pale Ale','淡色艾尔'),('en:blonde-ales','Blonde Ale','金色艾尔'),('en:dark-ales','Dark Ale','深色艾尔'),('en:dark-lagers','Dark Lager','深色拉格'),('en:pale-lagers','Pale Lager','淡色拉格')]+[('en:imperial-stouts','Imperial Stout','帝国世涛'),('en:india-pale-ales','IPA','印度淡色艾尔 IPA'),('en:ipas','IPA','印度淡色艾尔 IPA'),('en:stouts','Stout','世涛'),('en:porters','Porter','波特'),('en:wheat-beers','Wheat Beer','小麦啤酒'),('en:weissbiers','Wheat Beer','小麦啤酒'),('en:triple-beers','Tripel','三料啤酒'),('en:blond-beers','Blonde Beer','金色啤酒'),('en:blonde-beers','Blonde Beer','金色啤酒'),('en:amber-beers','Amber Beer','琥珀啤酒'),('en:brown-beers','Brown Beer','棕色啤酒'),('en:lagers','Lager','拉格'),('en:pilseners','Pilsner','皮尔森'),('en:pilsners','Pilsner','皮尔森'),('en:non-alcoholic-beers','Alcohol-free Beer','无醇啤酒')]

def numeric(value):
    try:return float(value or 0)
    except (ValueError,TypeError):return 0

def image_size(blob):
    if blob[:8]==b'\x89PNG\r\n\x1a\n':return struct.unpack('>II',blob[16:24])
    if blob[:2]!=b'\xff\xd8':raise ValueError('Not a JPEG/PNG')
    i=2
    while i<len(blob)-8:
        if blob[i]!=255:i+=1;continue
        while i<len(blob) and blob[i]==255:i+=1
        marker=blob[i];i+=1
        if marker in (0xd8,0xd9) or 0xd0<=marker<=0xd7:continue
        length=int.from_bytes(blob[i:i+2],'big')
        if length<2:break
        if marker in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf):
            return int.from_bytes(blob[i+5:i+7],'big'),int.from_bytes(blob[i+3:i+5],'big')
        i+=length
    raise ValueError('No image dimensions')

def source_image(product):
    code=str(product.get('code',''))
    if not code.isdigit() or not 8<=len(code)<=18:return None
    images=product.get('images') or {}
    if isinstance(images,list):images={str(x['key']):x for x in images if isinstance(x,dict) and x.get('key')}
    language=product.get('lang') or product.get('lc') or ''
    keys=[f'front_{language}','front_en','front_fr']+sorted(k for k in images if k.startswith('front_') or k=='front')
    for key in dict.fromkeys(keys):
        selected=images.get(key) or {}
        imgid=str(selected.get('imgid') or '')
        if not imgid.isdigit() or not images.get(imgid):continue
        raw=images[imgid];size=(raw.get('sizes') or {}).get('400') or {}
        if not size or min(size.get('h') or 0,size.get('w') or 0)<90:continue
        folder='/'.join([code[:3],code[3:6],code[6:9],code[9:]]) if len(code)>8 else code
        # The selected front's original photo is mirrored to AWS, avoiding an
        # arbitrary first image that could be a nutrition label or receipt.
        file=f'{folder}/{imgid}.400.jpg'
        aws_code=code.zfill(13) if len(code)<13 else code
        aws_folder='/'.join([aws_code[:3],aws_code[3:6],aws_code[6:9],aws_code[9:]])
        return {'code':code,'key':key,'imgid':imgid,'awsUrl':AWS+aws_folder+f'/{imgid}.400.jpg','cdnUrl':CDN+file,'uploader':raw.get('uploader') or 'Open Food Facts contributors','uploadedAt':raw.get('uploaded_t'),'selection':selected,'rawImage':raw}
    return None

def fetch_image(candidate):
    path=IMAGES/f"{candidate['code']}-{candidate['imgid']}.jpg"
    if path.exists():
        blob=path.read_bytes();w,h=image_size(blob)
        return {**candidate,'image':'/images/off/'+path.name,'bytes':len(blob),'width':w,'height':h,'sha256':hashlib.sha256(blob).hexdigest(),'downloadUrl':candidate['awsUrl']}
    errors=[]
    for url in [candidate['awsUrl'],candidate['cdnUrl']]:
        try:
            if url.startswith(CDN):cdn_lock.acquire();time.sleep(.25)
            try:
                req=urllib.request.Request(url,headers={'User-Agent':UA})
                with urllib.request.urlopen(req,timeout=18) as response:
                    blob=response.read(2_500_001)
            finally:
                if url.startswith(CDN):cdn_lock.release()
            if len(blob)>2_500_000:raise ValueError('Image over 2.5MB')
            w,h=image_size(blob)
            if min(w,h)<90 or max(w,h)<200:raise ValueError('Image too small')
            path.write_bytes(blob)
            return {**candidate,'image':'/images/off/'+path.name,'bytes':len(blob),'width':w,'height':h,'sha256':hashlib.sha256(blob).hexdigest(),'downloadUrl':url}
        except Exception as e:errors.append(f'{url}: {type(e).__name__}: {e}')
    return {'code':candidate['code'],'error':errors}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',type=Path,default=CACHE/'products.json');parser.add_argument('--limit',type=int,default=600);args=parser.parse_args()
    source=json.loads(args.input.read_text());products=source if isinstance(source,list) else source['products']
    products=[p for p in products if not {'en:liqueurs','en:vodkas','en:rums','en:ciders','en:wines'}.intersection(p.get('categories_tags') or []) and 'en:beers' in (p.get('categories_tags') or []) and not any('root-beer' in t or 'confection' in t for t in p.get('categories_tags') or [])]
    by_code={str(p['code']):p for p in products};index=matching.BreweryIndex(ROOT);report=matching.match_catalog(products,root=ROOT)
    CACHE.mkdir(parents=True,exist_ok=True);IMAGES.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
    review_path=CACHE/'visual-exclusions.json'
    review=json.loads(review_path.read_text()) if review_path.exists() else {}
    rejected_entries=review.get('exclusions',[]) if isinstance(review,dict) else review
    rejected_codes={str(e.get('barcode') or e.get('code')) for e in rejected_entries if isinstance(e,dict)}
    candidates=[]
    for group in report['groups']:
        if not group['mergeEligible']:continue
        choices=[(by_code[c],source_image(by_code[c])) for c in group['barcodes']]
        choices=[(p,im) for p,im in choices if im and str(p['code']) not in rejected_codes]
        if not choices:continue
        # Prefer a recent complete selected front; keep only one package photo per group.
        p,im=max(choices,key=lambda x:(numeric(x[1].get('uploadedAt')),numeric(x[0].get('last_modified_t'))))
        candidates.append({'group':group,'product':p,'image':im})
    # Round-robin brands within mapped/unmapped pools so one brand cannot consume
    # the whole bounded photo sample. Actual data, never invented geography.
    pools={True:{},False:{}}
    candidates.sort(key=lambda c:('en:craft-beers' not in c['product'].get('categories_tags',[]),not any(t in c['product'].get('categories_tags',[]) for t in ['ca:cervesa-ipa','en:stouts','en:sour-beers','en:triple-ales'])))
    for c in candidates:
        located=c['group']['reference'].get('lat') is not None
        brand=c['product'].get('brands') or ''
        pools[located].setdefault(brand,[]).append(c)
    chosen=[]
    for located in [True,False]:
        brands=pools[located]
        while brands and len(chosen)<args.limit:
            for brand in list(brands):
                chosen.append(brands[brand].pop(0))
                if not brands[brand]:del brands[brand]
                if len(chosen)>=args.limit:break
    print(json.dumps({'validBeerProductRows':len(products),'identityGroups':len(report['groups']),'candidateGroupsWithSelectedFront':len(candidates),'selectedForDownload':len(chosen)},ensure_ascii=False),flush=True)
    downloads={};done=0
    with ThreadPoolExecutor(max_workers=5) as pool:
        for c,im in zip(chosen,pool.map(fetch_image,[x['image'] for x in chosen])):
            downloads[c['group']['id']]=im;done+=1
            if done%25==0:print(f'images {done}/{len(chosen)}',flush=True)
    beers=[];breweries={};used_products=[];image_manifest=[];failures=[];seen_hashes=set()
    for c in chosen:
        g,p=c['group'],c['product'];im=downloads[g['id']]
        if 'error' in im:failures.append(im);continue
        if im['sha256'] in seen_hashes:failures.append({'code':str(p['code']),'error':'duplicate photo bytes across product groups; left for identity review'});continue
        seen_hashes.add(im['sha256']);reference=g['reference'];code=str(p['code']);brands=p.get('brands') or ', '.join(g['products'][0]['brands'])
        if reference.get('breweryId'):
            br=dict(index.breweries[reference['breweryId']]);br.pop('sourceCollection',None)
        else:
            br={'id':'off-brand-'+hashlib.sha256(matching.normalize(brands).encode()).hexdigest()[:12],'name':brands,'nameZh':brands,'country':None,'countryZh':'产地待核对','city':None,'lat':None,'lng':None,'year':None,'website':None,'locationRole':'unresolved_brand','locationPrecision':None,'description':'来源提供品牌名称，尚未确认对应酒厂与生产地点。','sourceUrls':[f'https://world.openfoodfacts.org/product/{code}']}
        breweries[br['id']]=br
        style,stylezh=next(((en,zh) for tag,en,zh in STYLES if tag in p.get('categories_tags',[])),('Unclassified Beer','风格待核对'))
        name=p.get('product_name') or g['name']
        if not matching.normalize(name).startswith(matching.normalize(brands)) and len(brands)<55:name=brands+' · '+name
        abv=matching.supplied_abv(p);abv=abv if abv is not None and 0<=abv<=30 else None
        page=f'https://world.openfoodfacts.org/product/{code}'
        source_note='Open Food Facts 官方公开商品资料；只沿用已选正面图片对应的原图。品牌/规范商品名归并包装条码，未做跨来源酒款等同性或精酿认证。'+reference.get('geographyNote','销售国家与原料来源未作为产地；位置待核对。')
        beer={'id':g['id'],'name':name,'breweryId':br['id'],'collection':'off','style':style,'styleZh':stylezh,'abv':abv,'ibu':None,'srm':None,'description':'','originalDescription':'','flavors':[],'flavorEvidence':[],'hops':[],'malts':[],'yeast':None,'foodPairings':[],'firstBrewed':None,'image':im['image'],'imageSource':page,'imageDownloadUrl':im['downloadUrl'],'imageLicenseUrl':CC,'imageCredit':f"照片：{im['uploader']} / Open Food Facts，CC BY-SA 3.0；选定正面图对应的原始照片，未修改。",'sourceUrls':[page,OFF,LICENSE,CC], 'sourceNote':source_note,'craftStatus':'unknown','packagingCodes':g['barcodes'],'sourceModified':p.get('last_modified_t'),'sourceIndexedAt':p.get('last_indexed_datetime'),'offCategories':p.get('categories_tags',[]),'imageEvidence':{'barcode':code,'selectedFrontKey':im['key'],'originalImageId':im['imgid'],'uploader':im['uploader'],'uploadedAt':im['uploadedAt'],'sha256':im['sha256'],'width':im['width'],'height':im['height']},'locationEvidence':reference.get('locationEvidence',{'productionLocationVerified':False,'salesCountriesUsed':False,'sourceBreweryId':reference.get('breweryId'),'sourceUrls':reference.get('locationSourceUrls',[])}),'brandReference':reference,'identityEvidence':{k:v for k,v in g.items() if k not in ['reference','products']},'sourceDataUrl':'/data-sources/off/products.json','dataLicense':'ODbL-1.0 / DbCL-1.0','dataQualityFlags':['craft_status_unknown','source_packaging_photo','flavor_not_provided']+([] if reference.get('lat') is not None else ['location_unverified'])}
        beers.append(beer);used_products.extend(by_code[c] for c in g['barcodes']);image_manifest.append({**im,'beerId':beer['id'],'sourcePage':page,'license':CC})
    # Default gallery opens with mapped brands and distinctive names, then the remaining pictured records.
    assert beers,'No actual photo passed download and identity checks'
    assert len({b['id'] for b in beers})==len(beers)
    used_products=[{k:({sk:sv for sk,sv in v.items() if sk!='headers'} if k=='_source' and isinstance(v,dict) else v) for k,v in p.items()} for p in used_products]
    SOURCE.joinpath('products.json').write_text(json.dumps({'source':OFF,'products':used_products},ensure_ascii=False,indent=2)+'\n')
    SOURCE.joinpath('images.json').write_text(json.dumps({'license':CC,'images':image_manifest},ensure_ascii=False,indent=2)+'\n')
    SOURCE.joinpath('NOTICE.md').write_text('''# Open Food Facts 实物照片与商品资料\n\n来源： https://world.openfoodfacts.org 。通过官方公开搜索 https://search.openfoodfacts.org 与官方备用快照 https://huggingface.co/datasets/openfoodfacts/product-database 读取；每条保留实际来源。每款条码商品及照片作者见 products.json、images.json 和酒款资料。\n\n数据库 ODbL 1.0：https://opendatacommons.org/licenses/odbl/1-0/\n单项内容 DbCL 1.0：https://opendatacommons.org/licenses/dbcl/1-0/\n照片 CC BY-SA 3.0：https://creativecommons.org/licenses/by-sa/3.0/\n官方说明：https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/\n\n派生 /data/off.json 继续以上数据库许可。处理包括精确类别筛选、品牌与明确商品名包装去重、中文风格显示标签、已有来源的品牌参考位置关联及缺失值标注。照片沿用官方选定正面图对应的原始照片400px版本，未改动像素。原图可能为瓶、罐或多件包装，非透明抠图。照片里的包装图案仍可能包含品牌等第三方权利。\n\n商品销售地区与原料来源未用于地图定位。未提供风味时留空；没有以品牌关系推定逐款实际生产厂。未核验全部酒款的精酿属性，条数不能充作全球独立精酿数量。\n''')
    for name in ['brand-reference-aliases.json','visual-exclusions.json']:
        if (CACHE/name).exists():shutil.copy2(CACHE/name,SOURCE/name)
    counts={'beers':len(beers),'photos':len(image_manifest),'imageBytes':sum(i['bytes'] for i in image_manifest),'breweryBrandReferences':len(breweries),'mappedBrandReferences':sum(matching.has_location(b) for b in breweries.values()),'mappedPhotoRecords':sum(matching.has_location(breweries[b['breweryId']]) for b in beers),'referenceCountriesOrRegions':len({b['country'] for b in breweries.values() if b.get('country')}),'abv':sum(b['abv'] is not None for b in beers),'preservedPackagingRecords':len(used_products),'failedOrDuplicateImages':len(failures),'visualExclusionBarcodes':len(rejected_codes)}
    metadata={'collection':'off','title':'Open Food Facts 实物图测试酒库','importedAt':datetime.now(timezone.utc).isoformat(),'source':OFF,'sourceSnapshot':{k:v for k,v in source.items() if k!='products'} if isinstance(source,dict) else {},'counts':counts,'scopeNote':'只统计实际下载成功、有明确品牌/商品名的有图商品组。保留条码，不冒称独立精酿；未知产地不上图。','license':{'database':'ODbL-1.0','contents':'DbCL-1.0','images':'CC-BY-SA-3.0'}}
    OUT.write_text(json.dumps({'metadata':metadata,'breweries':list(breweries.values()),'beers':beers},ensure_ascii=False,indent=2)+'\n')
    CACHE.joinpath('image-failures.json').write_text(json.dumps(failures,ensure_ascii=False,indent=2)+'\n')
    CACHE.joinpath('import-summary.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(counts,ensure_ascii=False),flush=True)

if __name__=='__main__':main()
