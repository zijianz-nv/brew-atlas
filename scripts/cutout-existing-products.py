#!/usr/bin/env python3
"""Reviewed local alpha-only derivatives for existing world/curated photos.

No AI model, remote request, inpainting, label editing, or source overwriting.
Full PNG retains original canvas and decoded RGB; WebP derivatives downsize
that RGBA canvas proportionally. Explicit IDs prevent fuzzy product matching.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/images/cutouts'
QA=ROOT/'.runtime/cutouts-existing'
MANIFEST=ROOT/'public/data-sources/image-cutouts/catalog-cutouts.json'


def load_module(name,filename):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/filename)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


mask_helper=load_module('reviewed_silhouette','cutout-saldens-epica.py')
measure=load_module('alpha_measurement','measure-regional-image-bounds.py').measure

# [y,left,right] points traced on each actual source photograph. In particular,
# white neck/body labels are opaque, and the reflected tabletop is excluded.
RECORDS=[
 ('weihen-dunkel','/images/world-weihen-dunkel.jpg',[
  [18,243,245],[20,230,260],[24,221,270],[31,216,275],[41,214,278],
  [46,218,273],[53,216,276],[61,215,277],[69,219,273],
  [83,218,273],[109,214,277],[135,208,283],[164,201,292],
  [193,193,302],[229,183,312],[270,175,320],[309,170,325],
  [342,169,327],[450,169,327],[550,169,328],[603,168,329],
  [623,171,326],[635,176,321],[641,188,308],[644,211,286],[645,249,250]]),
 ('weihen-hefe','/images/world-weihen-hefe.jpg',[
  [19,243,245],[22,226,264],[28,217,272],[38,212,278],[45,216,274],
  [54,213,277],[65,215,276],[71,218,272],[99,215,274],[125,210,280],
  [154,202,289],[185,193,300],[218,183,311],[253,174,319],[291,168,325],
  [328,166,327],[435,166,327],[550,166,328],[603,165,329],
  [622,168,326],[634,174,320],[641,187,307],[645,211,285],[646,246,247]]),
 ('chimay-red','/images/world-chimay-red.jpg',[
  [38,244,246],[40,222,270],[45,207,282],[55,201,287],[69,201,288],
  [73,206,284],[88,202,288],[99,204,286],[108,209,280],[130,206,283],
  [158,199,291],[181,192,299],[211,182,309],[239,171,320],
  [269,157,335],[299,145,348],[319,141,354],[348,140,357],
  [420,140,359],[520,140,360],[579,140,360],[599,142,357],
  [614,150,349],[621,168,329],[626,202,292],[628,245,246]]),
 ('latrappe-quad','/images/world-latrappe-quad.jpg',[
  [0,289,291],[2,267,318],[8,256,327],[19,253,330],[24,257,325],
  [37,254,329],[49,254,329],[53,260,323],[76,257,325],[123,252,330],
  [171,246,336],[211,237,345],[248,226,355],[282,217,364],
  [307,212,369],[348,210,369],[450,210,369],[550,211,368],
  [595,213,365],[615,219,359],[625,234,346],[632,258,321],[635,288,290]]),
 ('latrappe-tripel','/images/world-latrappe-tripel.jpg',[
  [16,278,280],[18,255,301],[24,243,314],[36,240,317],[41,245,312],
  [57,240,316],[67,243,314],[72,247,309],[106,241,312],[150,236,317],
  [190,229,324],[225,220,332],[266,209,344],[300,200,351],
  [330,196,355],[400,195,356],[520,195,355],[607,196,353],
  [628,201,348],[639,216,334],[645,239,312],[649,273,276]]),
 ('nogne-ipa','/images/world-nogne-ipa.jpg',[
  [12,167,172],[14,146,193],[20,133,206],[29,129,212],[36,133,208],
  [53,128,212],[70,126,214],[79,133,207],[110,130,210],[161,124,216],
  [223,120,221],[267,114,227],[289,107,234],[313,91,251],
  [339,80,262],[368,74,268],[390,74,269],[450,77,267],
  [550,80,265],[650,83,263],[707,85,260],[729,95,251],
  [747,113,235],[759,137,213],[769,159,190],[773,173,176]]),
 ('nogne-saison','/images/world-nogne-saison.jpg',[
  [14,197,201],[17,175,224],[22,162,236],[31,159,240],[38,163,236],
  [54,158,241],[70,156,243],[79,163,236],[110,160,240],[171,155,245],
  [234,150,250],[279,145,255],[296,138,264],[315,123,281],
  [339,113,291],[365,107,297],[388,106,298],[450,108,297],
  [550,110,295],[650,112,292],[702,116,289],[728,126,280],
  [747,145,263],[759,166,243],[768,191,219],[770,204,207]]),
 ('orval','/images/world-orval.png',[
  [55,243,246],[57,216,278],[63,192,301],[77,180,312],[92,175,316],
  [103,174,317],[111,181,310],[133,175,316],[153,173,318],[165,182,308],
  [220,179,312],[280,174,316],[340,165,325],[398,153,338],
  [454,140,354],[510,122,374],[568,105,394],[628,88,411],
  [694,74,424],[758,68,431],[840,69,432],[940,75,429],
  [1030,86,421],[1120,98,410],[1180,106,401],[1205,120,388],
  [1217,150,357],[1226,194,314],[1231,245,249]]),
 ('chouffe','/images/world-chouffe.jpg',[
  [29,245,249],[31,220,278],[37,203,293],[49,193,302],[61,191,304],
  [70,198,297],[86,193,302],[106,193,302],[115,201,295],
  [138,197,299],[160,193,302],[183,183,314],[207,167,330],
  [231,157,339],[258,152,344],[286,149,348],[310,137,361],
  [337,123,375],[367,115,382],[395,114,383],[500,115,383],
  [610,115,383],[662,117,380],[691,125,372],[711,146,353],
  [722,174,329],[730,210,293],[734,246,250]]),
 ('curated-award-1239720','/images/curated/awards-1239720.jpg',[
  [0,148,152],[2,139,162],[7,133,167],[12,134,167],[16,137,164],
  [25,134,166],[43,132,168],[61,131,169],[81,130,170],
  [104,128,172],[117,123,177],[130,115,185],[143,112,188],
  [166,112,188],[230,112,188],[280,113,188],[290,118,184],
  [295,129,174],[298,144,159],[299,151,152]]),
]


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def white_background_spans(rgb):
    """Preserve every interior pixel, including white labels/highlights.

    Only the outer nonwhite envelope is extracted on these four reviewed
    uniformly white backgrounds. This is not a per-pixel white colour key.
    """
    a=np.asarray(rgb)
    assert np.min(a[:,:12])>=249 and np.min(a[:,-12:])>=249
    result=[]
    for y,row in enumerate(a):
        xs=np.flatnonzero(row.min(axis=1)<235)
        if len(xs):result.append([y,float(xs[0])+.15,float(xs[-1])+.85])
    assert result
    # Extend through the actual final pixel row instead of inventing a pointed
    # bottom. The original rounded base determines its entire row width.
    result.append([result[-1][0]+.9,result[-1][1],result[-1][2]])
    return result
def rectangle(box):
    x,y,r,b=box;return {'x':x,'y':y,'width':r-x,'height':b-y}
def derivative(image,path,limit):
    output=image.copy();output.thumbnail((limit,limit),Image.Resampling.LANCZOS)
    output.save(path,'WEBP',lossless=True,method=6,exact=True)
    return output.size
def review(image,stem):
    l,t,r,b=image.getchannel('A').getbbox()
    crop=image.crop((max(0,l-10),max(0,t-10),min(image.width,r+10),min(image.height,b+10)))
    crop.thumbnail((360,780),Image.Resampling.LANCZOS)
    sheet=Image.new('RGB',(crop.width*2,crop.height+24),'white')
    for i,color in enumerate(((242,244,247),(20,29,43))):
        tile=Image.new('RGBA',crop.size,color+(255,));tile.alpha_composite(crop);sheet.paste(tile.convert('RGB'),(i*crop.width,24))
    ImageDraw.Draw(sheet).text((5,5),stem,fill='black');sheet.save(QA/(stem+'-review.png'))


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--only',nargs='*');ap.add_argument('--approve-reviewed',action='store_true');args=ap.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);QA.mkdir(parents=True,exist_ok=True);MANIFEST.parent.mkdir(parents=True,exist_ok=True)
    entries=[]
    for beer_id,source_url,spans in RECORDS:
        if args.only and beer_id not in args.only:continue
        source=ROOT/'public'/source_url.lstrip('/');source_sha=sha(source)
        rgb=Image.open(source).convert('RGB')
        white_envelope=beer_id in ['nogne-ipa','nogne-saison','orval','curated-award-1239720']
        if white_envelope:
            spans=white_background_spans(rgb)
            if beer_id=='orval':
                # The white diagonal paper edge blends into the white studio
                # background at y610–638. Its manually reviewed outer contour
                # must remain opaque, not be mistaken for a background notch.
                for span in spans:
                    if 600<=span[0]<=640:
                        span[1]=min(span[1],float(np.interp(span[0],[600,610,620,630,640],[98,95,92,89,87]))+.15)
        mask=mask_helper.make_mask(rgb.size,spans)
        image=rgb.copy();image.putalpha(mask)
        stem=beer_id+'-cutout';full=OUT/(stem+'.png');card=OUT/(stem+'-card.webp');thumb=OUT/(stem+'-map.webp')
        image.save(full,compress_level=9)
        card_size=derivative(image,card,800);thumbnail_size=derivative(image,thumb,320)
        full_decoded=Image.open(full)
        assert full_decoded.mode=='RGBA' and full_decoded.size==rgb.size
        assert np.array_equal(np.array(full_decoded)[:,:,:3],np.array(rgb))
        assert mask.getextrema()==(0,255) and source_sha==sha(source)
        for file in [card,thumb]:assert Image.open(file).convert('RGBA').getchannel('A').getextrema()==(0,255)
        review(image,beer_id)
        framing=measure(card)
        entries.append({'beerId':beer_id,'sourceImage':source_url,'sourceSha256':source_sha,
          'imageFull':'/images/cutouts/'+full.name,'fullSha256':sha(full),
          'image':'/images/cutouts/'+card.name,'sha256':sha(card),
          'imageThumbnail':'/images/cutouts/'+thumb.name,'thumbnailSha256':sha(thumb),
          'width':image.width,'height':image.height,'cardSize':list(card_size),'thumbnailSize':list(thumbnail_size),
          'bounds':framing['bounds'],'imageContentBounds':framing,'fullImageContentBounds':measure(full),
          'thumbnailImageContentBounds':measure(thumb),'alphaBounds':rectangle(mask.getbbox()),
          'method':'local-python-reviewed-white-background-envelope-alpha-only' if white_envelope else 'local-python-manual-silhouette-alpha-only',
          'parameters':{'silhouetteSpansYLeftRight':spans,'maskSupersampling':4,'maskDownsampling':'BOX',
              'interpolation':'shape-preserving cubic Hermite','rgbOperation':'none on full PNG',
              'whiteBackgroundEnvelopeThreshold':235 if white_envelope else None,
              'preserveAllInteriorPixels':True,
              'manualWhiteLabelBoundaryRepair':{'side':'left','rangeY':[600,640],'points':[[600,98],[610,95],[620,92],[630,89],[640,87]]} if beer_id=='orval' else None,
              'sourceCanvasPreserved':True,'derivatives':{'cardMaximumDimension':800,'mapMaximumDimension':320,
                  'resample':'LANCZOS','format':'lossless WebP','alphaPreserved':True}},
          'originalRGBunchanged':True,'reviewed':bool(args.approve_reviewed),
          'sourceUnchanged':True,'note':'Original photograph retained; only package silhouette is shown. Source pixels are not redrawn.'})
    payload={'schemaVersion':1,'script':'scripts/cutout-existing-products.py','images':entries}
    MANIFEST.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'count':len(entries),'reviewed':bool(args.approve_reviewed),'manifest':str(MANIFEST.relative_to(ROOT)),
      'fullBytes':sum((ROOT/'public'/e['imageFull'].lstrip('/')).stat().st_size for e in entries),
      'cardBytes':sum((ROOT/'public'/e['image'].lstrip('/')).stat().st_size for e in entries),
      'mapBytes':sum((ROOT/'public'/e['imageThumbnail'].lstrip('/')).stat().st_size for e in entries)}))

if __name__=='__main__':main()
