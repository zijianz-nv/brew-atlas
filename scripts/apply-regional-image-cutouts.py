#!/usr/bin/env python3
"""Apply reviewed alpha-only derivatives and build local WebP display sizes.

Requires Pillow during asset preparation only, never during normal app builds.
Source assets, source evidence, and full-resolution alpha PNGs are retained.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('image_bounds', ROOT/'scripts/measure-regional-image-bounds.py')
bounds_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounds_module)

def local(asset):
    if not asset.startswith('/images/') or '..' in Path(asset).parts:
        raise ValueError('Expected a local image asset: '+asset)
    return ROOT/'public'/asset.lstrip('/')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def apply():
    registry_path=ROOT/'public/data-sources/regional/image-cutouts.json'
    registry=json.loads(registry_path.read_text())
    catalog_path=ROOT/'public/data/regional.json'
    catalog=json.loads(catalog_path.read_text())
    by_id={b['id']:b for b in catalog['beers']}
    total_original=total_cards=total_maps=0
    for record in registry['images']:
        if record['reviewStatus']!='approved':
            raise ValueError('Unreviewed image: '+record['beerId'])
        beer=by_id[record['beerId']]
        source=local(record['sourceImage']);cutout=local(record['image'])
        if digest(source)!=record['sourceSha256'] or digest(cutout)!=record['imageSha256']:
            raise ValueError('Source or reviewed cutout changed: '+beer['id'])
        original=Image.open(source).convert('RGBA');edited=Image.open(cutout).convert('RGBA')
        if original.size!=edited.size:
            raise ValueError('Reviewed cutouts must preserve source canvas')
        if ImageChops.difference(original.convert('RGB'),edited.convert('RGB')).getbbox():
            raise ValueError('Product RGB pixels changed: '+beer['id'])
        alpha=edited.getchannel('A')
        if alpha.getextrema()!=(0,255):raise ValueError('Expected real transparency and opaque product body')
        body=alpha.point(lambda x:255 if x>=64 else 0).getbbox()
        if not body:raise ValueError('Empty cutout')
        variants={}
        for variant,body_height in [('card',800),('map',320)]:
            scale=min(1,body_height/(body[3]-body[1]))
            size=(max(1,round(edited.width*scale)),max(1,round(edited.height*scale)))
            image=edited if size==edited.size else edited.resize(size,Image.Resampling.LANCZOS)
            path=cutout.with_name(cutout.stem+'-'+variant+'.webp')
            image.save(path,format='WEBP',lossless=True,method=6)
            variants[variant]={'path':'/'+str(path.relative_to(ROOT/'public')),'sha256':digest(path),'bytes':path.stat().st_size,'width':size[0],'height':size[1]}
        if beer['image']==record['sourceImage']:
            beer['imageBeforeCutout']={key:beer[key] for key in ['image','imageOriginal','imageThumbnail','imageEvidence','imageContentBounds','imageCacheStatus','imageCredit'] if key in beer}
        elif beer.get('imageBeforeCutout',{}).get('image')!=record['sourceImage']:
            raise ValueError('Unexpected current image for '+beer['id'])
        beer.update(image=variants['card']['path'],imageThumbnail=variants['map']['path'],imageOriginal=record['image'],imageCacheStatus='cached')
        beer['imageEvidence']={**beer['imageBeforeCutout'].get('imageEvidence',{}),
            'sha256':variants['card']['sha256'],'sourceImageSha256':record['sourceSha256'],
            'originalBytesPreserved':False,'originalFileRetained':True,'derivative':True,
            'cacheStatus':'cached','processingMethod':'reviewed_alpha_mask_with_local_display_sizes'}
        beer['imageContentBounds']=bounds_module.measure(local(beer['image']))
        beer['imageDerivation']={'method':record['method'],'sourceImage':record['sourceImage'],
            'sourceSha256':record['sourceSha256'],'fullResolutionImage':record['image'],
            'fullResolutionSha256':record['imageSha256'],'rgbPixelsUnchanged':True,
            'displayVariants':variants,'reviewedAt':record.get('reviewedAt','2026-10-02'),
            'notice':'/data-sources/regional/image-cutouts.json'}
        if record.get('limitations'):beer['imageDerivation']['limitations']=record['limitations']
        beer['needsBackgroundRemoval']=False
        record['displayVariants']=variants
        total_original+=cutout.stat().st_size;total_cards+=variants['card']['bytes'];total_maps+=variants['map']['bytes']
    catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    registry['displayBytes']={'fullResolution':total_original,'cards':total_cards,'map':total_maps}
    registry_path.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'cutouts':len(registry['images']),**registry['displayBytes']}))

if __name__=='__main__':apply()
