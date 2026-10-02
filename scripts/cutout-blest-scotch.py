#!/usr/bin/env python3
"""Exact-ID alpha-only fix for the Blest Scotch bottle shown near El Bolsón.

The original photo contains a can and bottle on a white studio background.
Keep the complete right-hand bottle, with original decoded RGB, in the full
source canvas. Never overwrite the source photograph or the other cutouts.
"""
from pathlib import Path
import importlib.util
import json
import sys
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('cutout_helpers',ROOT/'scripts/cutout-existing-products.py')
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
source_url='/images/curated/awards-457181.jpg'
source=ROOT/'public'/source_url.lstrip('/')
rgb=Image.open(source).convert('RGB')
# Reviewed outer contour of the right-hand bottle; excludes the cast shadow.
spans=[
 [57,422,429],[60,400,453],[65,389,466],[75,379,476],[88,376,478],
 [98,380,474],[106,380,473],[113,387,466],[141,383,469],
 [194,379,474],[245,375,478],[292,367,485],[326,352,501],
 [357,330,521],[391,313,533],[425,306,539],[470,304,541],
 [600,302,541],[780,301,540],[884,303,537],[910,310,532],
 [928,326,519],[940,351,498],[948,388,466],[950,422,429]]
# Follow the actual white-background envelope above the rounded base instead
# of interpolating a stylised shoulder: only the outside boundary is sampled,
# so every interior label and highlight stays opaque.
pixels=np.asarray(rgb)
envelope=[]
for y in range(54,911):
 xs=np.flatnonzero(pixels[y,295:550].min(axis=1)<235)+295
 if len(xs):envelope.append([y,float(xs[0])+.25,float(xs[-1])+.75])
for y in range(911,952):
 xs=np.flatnonzero(pixels[y,295:550].min(axis=1)<135)+295
 if len(xs):envelope.append([y,float(xs[0])+.35,float(xs[-1])+.65])
spans=envelope+[[952,421,422]]
mask=helper.mask_helper.make_mask(rgb.size,spans)
rgba=rgb.copy();rgba.putalpha(mask)
helper.OUT.mkdir(parents=True,exist_ok=True);helper.QA.mkdir(parents=True,exist_ok=True)
stem='curated-award-457181-cutout'
full=helper.OUT/(stem+'.png');card=helper.OUT/(stem+'-card.webp');thumb=helper.OUT/(stem+'-map.webp')
rgba.save(full,compress_level=9)
card_size=helper.derivative(rgba,card,800);thumb_size=helper.derivative(rgba,thumb,320)
assert np.array_equal(np.asarray(Image.open(full))[:,:,:3],np.asarray(rgb))
helper.review(rgba,'curated-award-457181')
entry={'beerId':'curated-award-457181','sourceImage':source_url,'sourceSha256':helper.sha(source),
 'imageFull':'/images/cutouts/'+full.name,'fullSha256':helper.sha(full),
 'image':'/images/cutouts/'+card.name,'sha256':helper.sha(card),
 'imageThumbnail':'/images/cutouts/'+thumb.name,'thumbnailSha256':helper.sha(thumb),
 'width':rgb.width,'height':rgb.height,'cardSize':list(card_size),'thumbnailSize':list(thumb_size),
 'imageContentBounds':helper.measure(card),'fullImageContentBounds':helper.measure(full),
 'thumbnailImageContentBounds':helper.measure(thumb),'alphaBounds':helper.rectangle(mask.getbbox()),
 'method':'local-python-reviewed-single-bottle-silhouette-alpha-only',
 'parameters':{'silhouetteSpansYLeftRight':spans,'maskSupersampling':4,'maskDownsampling':'BOX',
   'rgbOperation':'none on full PNG','sourceCanvasPreserved':True,'preserveAllInteriorPixels':True},
 'originalRGBunchanged':True,'sourceUnchanged':True,'reviewed':'--approve-reviewed' in sys.argv,
 'note':'Complete right-hand bottle extracted; original bottle-and-can photograph retained unchanged.'}
manifest=json.loads(helper.MANIFEST.read_text())
manifest['images']=[e for e in manifest['images'] if e['beerId']!=entry['beerId']]+[entry]
helper.MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'id':entry['beerId'],'review':str(helper.QA/'curated-award-457181-review.png'),
 'registryImages':len(manifest['images'])}))
