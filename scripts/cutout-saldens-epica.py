#!/usr/bin/env python3
"""Deterministic alpha-only cutouts of ten reviewed regional package photographs.

No model, recolouring, inpainting, resampling, or source modification is used.
Coordinates describe manually traced left/right silhouettes, not a brightness
threshold: dark glass, printed labels, the cap, and the base stay opaque.
Run with the bundled Python containing Pillow and NumPy; outputs retain canvas.
"""
from pathlib import Path
import hashlib
import json
import argparse
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/images/regional/cutouts'
MANIFEST = ROOT / 'research/regional-expansion-2026-10-02/cutouts-saldens-epica.json'
QA = ROOT / '.runtime/cutouts-saldens-epica'

# [source y, left x, right x], in original-image pixels. Fine cap/base points
# preserve rounded contours; monotonically interpolated boundaries cannot bulge.
SPANS = {
 'saldens-tears-of-liberty': [
  [247,736,737],[249,633,846],[252,593,882],[256,577,898],
  [265,576,900],[276,579,897],[286,575,900],[301,566,909],
  [321,554,921],[338,544,932],[349,541,936],[400,541,936],
  [600,541,936],[800,541,936],[1000,541,936],[1160,542,936],
  [1198,544,934],[1214,551,926],[1231,566,912],[1248,588,890],
  [1263,619,859],[1275,655,826],[1281,698,787],[1283,742,743]],
 'saldens-aipa-4c': [
  [251,736,737],[253,620,858],[256,582,888],[260,578,898],
  [270,578,898],[279,580,896],[290,575,900],[304,566,907],
  [321,555,917],[340,544,928],[350,543,932],[400,543,932],
  [600,540,931],[800,539,929],[1000,537,927],[1160,537,925],
  [1193,540,922],[1210,548,913],[1227,564,897],[1242,586,875],
  [1255,615,846],[1264,654,810],[1269,699,767],[1270,730,731]],
 'saldens-six-hops': [
  [247,744,745],[250,599,853],[254,585,892],[259,582,902],
  [271,584,901],[280,582,901],[295,574,908],[313,563,918],
  [332,551,929],[348,548,937],[400,548,936],[600,545,935],
  [800,544,933],[1000,541,931],[1165,541,929],[1194,544,925],
  [1210,555,914],[1227,573,896],[1243,598,872],[1256,630,841],
  [1264,668,805],[1268,708,766],[1269,737,738]],
 'saldens-grapefruit-dipa': [
  [251,748,749],[254,615,870],[257,591,899],[262,589,909],
  [271,590,910],[280,590,907],[296,581,914],[317,569,925],
  [337,557,937],[350,553,942],[400,552,942],[600,550,941],
  [800,548,939],[1000,546,937],[1162,545,935],[1193,548,931],
  [1211,558,921],[1228,576,903],[1244,601,878],[1258,634,846],
  [1267,674,809],[1272,713,771],[1273,743,744]],
 'saldens-citra-mosaic-dipa': [
  [251,741,742],[254,620,862],[257,587,891],[262,581,901],
  [272,581,901],[281,583,899],[296,574,906],[315,563,917],
  [336,549,929],[349,545,935],[400,545,935],[600,543,934],
  [800,541,932],[1000,540,930],[1160,540,928],[1194,543,924],
  [1210,553,914],[1227,570,897],[1243,594,873],[1257,625,842],
  [1266,665,806],[1271,707,765],[1272,736,737]],
 'epica-eolo': [
  [142,538,539],[144,514,569],[150,499,584],[157,490,591],
  [168,486,595],[181,488,594],[187,491,591],[194,490,593],
  [207,488,593],[250,482,596],[300,475,600],[350,469,604],
  [400,463,607],[450,456,612],[482,451,616],[507,443,622],
  [530,433,631],[553,422,642],[578,414,653],[604,410,660],
  [634,409,664],[690,409,665],[800,409,665],[900,410,665],
  [990,411,663],[1025,413,660],[1050,416,656],[1067,422,649],
  [1077,433,638],[1084,452,619],[1089,483,587],[1091,536,537]],
 'epica-cerere': [
  [143,537,538],[145,512,569],[151,496,584],[159,488,591],
  [172,483,596],[182,486,594],[190,489,590],[197,488,592],
  [215,487,592],[260,480,596],[310,474,600],[360,468,604],
  [410,461,608],[460,455,613],[490,449,618],[514,440,626],
  [537,429,636],[559,419,647],[584,412,656],[612,408,662],
  [650,408,665],[750,408,665],[850,408,665],[950,409,664],
  [1015,411,662],[1045,414,658],[1065,420,650],[1076,430,638],
  [1083,449,615],[1088,481,581],[1090,535,536]],
 'epica-polifemo': [
  [148,543,544],[150,517,572],[156,500,590],[164,491,598],
  [177,487,602],[188,491,599],[195,494,596],[203,492,598],
  [240,488,598],[290,480,602],[340,474,606],[390,467,610],
  [440,461,613],[480,455,617],[511,446,624],[536,434,636],
  [559,424,647],[585,415,657],[614,411,663],[650,410,666],
  [750,410,666],[850,410,666],[950,411,664],[1020,413,662],
  [1050,417,657],[1068,424,649],[1079,436,635],[1086,457,612],
  [1091,488,581],[1093,538,539]],
 'epica-ares': [
  [154,539,540],[156,513,571],[162,498,586],[171,488,593],
  [185,482,598],[195,486,594],[202,490,591],[211,488,593],
  [255,482,596],[305,476,600],[355,469,604],[405,463,608],
  [455,456,613],[488,451,617],[516,442,625],[539,431,637],
  [563,420,649],[589,413,658],[617,409,664],[660,408,666],
  [760,408,666],[860,409,666],[960,410,664],[1020,412,662],
  [1050,416,657],[1068,423,649],[1079,435,635],[1086,455,611],
  [1091,487,580],[1093,536,537]],
 'epica-apollo': [
  [154,544,545],[156,517,575],[162,501,590],[171,492,598],
  [184,487,602],[195,491,599],[202,495,595],[211,493,597],
  [255,487,600],[305,481,604],[355,475,607],[405,468,611],
  [455,461,615],[486,455,619],[515,446,626],[540,434,638],
  [563,423,650],[589,416,659],[616,412,665],[660,411,667],
  [760,410,667],[860,410,666],[960,411,664],[1020,412,662],
  [1049,416,657],[1067,423,649],[1078,435,635],[1085,455,611],
  [1090,487,580],[1092,537,538]],
}

# Refinement after comparing each first-pass outline with 4x original edge
# crops. These move only the traced boundary inward from textured background;
# they do not modify RGB or erode the mask according to the glass's darkness.
EPICA_EDGE_REFINEMENT = [
    [190,0,0],[200,2,1],[250,4,3],[300,6,3],[350,6,3],
    [400,6,3],[450,6,4],[500,7,4],[550,7,4],[600,5,4],
    [650,3,3],[700,2,2],[900,2,2],[1000,2,2],[1040,1,1],
    [1065,0,1],[1100,0,0],
]


def reviewed_spans(stem, spans):
    if not stem.startswith('epica-'):
        return spans
    refinement = np.asarray(EPICA_EDGE_REFINEMENT, dtype=float)
    result = []
    for y,left,right in spans:
        dl = float(np.interp(y,refinement[:,0],refinement[:,1]))
        dr = float(np.interp(y,refinement[:,0],refinement[:,2]))
        if stem == 'epica-apollo':
            dl += float(np.interp(y,[200,250,600,700],[0,1,1,0]))
            dr += float(np.interp(y,[195,235,510,610],[0,2,2,0]))
        elif stem == 'epica-polifemo':
            dl += float(np.interp(y,[200,250,560,650],[0,1,1,0]))
            dr += float(np.interp(y,[195,230,490,550],[0,2,2,0]))
        elif stem == 'epica-cerere':
            dr += float(np.interp(y,[190,215,310,365],[0,2,2,0]))
        elif stem == 'epica-ares':
            dl += float(np.interp(y,[250,300,500,600],[0,1,1,0]))
        result.append([y,round(left+dl,3),round(right-dr,3)])
    return result


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def monotone_curve(x, y, sample):
    """Shape-preserving Hermite interpolation (no silhouette overshoot)."""
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    h = np.diff(x)
    slope = np.diff(y) / h
    tangent = np.zeros_like(y)
    tangent[0], tangent[-1] = slope[0], slope[-1]
    for i in range(1, len(y)-1):
        if slope[i-1] * slope[i] > 0:
            w1, w2 = 2*h[i]+h[i-1], h[i]+2*h[i-1]
            tangent[i] = (w1+w2)/(w1/slope[i-1]+w2/slope[i])
    idx = np.clip(np.searchsorted(x, sample)-1, 0, len(x)-2)
    t = (sample-x[idx])/h[idx]
    return ((2*t**3-3*t**2+1)*y[idx] + (t**3-2*t**2+t)*h[idx]*tangent[idx]
            + (-2*t**3+3*t**2)*y[idx+1] + (t**3-t**2)*h[idx]*tangent[idx+1])


def make_mask(size, spans):
    scale = 4
    controls = np.asarray(spans, dtype=float)
    ys = np.arange(controls[0, 0], controls[-1, 0]+.125, .25)
    left = monotone_curve(controls[:, 0], controls[:, 1], ys)
    right = monotone_curve(controls[:, 0], controls[:, 2], ys)
    assert np.all(left <= right)
    points = list(zip(left*scale, ys*scale)) + list(zip(right[::-1]*scale, ys[::-1]*scale))
    mask = Image.new('L', (size[0]*scale, size[1]*scale), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    # BOX coverage sampling has no Lanczos ringing or disconnected alpha specks.
    return mask.resize(size, Image.Resampling.BOX)


def make_previews(image, bounds, stem):
    x, y, w, h = (bounds[k] for k in ('x','y','width','height'))
    foreground = image.crop((max(0,x-12),max(0,y-12),min(image.width,x+w+12),min(image.height,y+h+12)))
    foreground.thumbnail((400, 950), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (foreground.width*2, foreground.height+30), 'white')
    for i, color in enumerate(((240,243,247),(20,28,40))):
        tile = Image.new('RGBA',foreground.size,color+(255,))
        tile.alpha_composite(foreground)
        canvas.paste(tile.convert('RGB'), (i*foreground.width,30))
    ImageDraw.Draw(canvas).text((5,8),stem,fill='black')
    canvas.save(QA / (stem+'-review.png'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--approve-reviewed', action='store_true', help='Use only after all ten output previews have been reviewed.')
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    entries = []
    for stem, spans in SPANS.items():
        spans = reviewed_spans(stem,spans)
        source = ROOT / 'public/images/regional' / (stem+'.jpg')
        original_sha = sha(source)
        rgb = Image.open(source).convert('RGB')
        mask = make_mask(rgb.size, spans)
        image = rgb.copy()
        image.putalpha(mask)
        target = OUT / (stem+'-cutout.png')
        image.save(target, compress_level=9)
        reread = Image.open(target)
        assert reread.mode == 'RGBA' and reread.size == rgb.size
        assert np.array_equal(np.asarray(reread)[:,:,:3], np.asarray(rgb)), 'Source RGB changed'
        assert mask.getextrema() == (0,255)
        assert sha(source) == original_sha
        l,t,r,b = mask.getbbox()
        bounds = {'x':l,'y':t,'width':r-l,'height':b-t}
        make_previews(image,bounds,stem)
        entries.append({
            'beerId':'regional-'+stem,
            'sourceImage':'/images/regional/'+source.name,
            'sourceSha256':original_sha,
            'image':'/images/regional/cutouts/'+target.name,
            'imageSha256':sha(target),
            'width':image.width,'height':image.height,'alphaBounds':bounds,
            'method':'manual-reviewed-silhouette-alpha-only',
            'parameters':{'silhouetteSpansYLeftRight':spans,
                          'interpolation':'shape-preserving cubic Hermite',
                          'maskSupersampling':4,'maskDownsampling':'BOX',
                          'rgbOperation':'none; decoded source RGB retained pixel-for-pixel',
                          'canvasOperation':'none; source dimensions retained',
                          'alphaOnly':True},
            'reviewStatus':'approved' if args.approve_reviewed else 'pending',
            'verification':{'rgbPixelEquality':True,'originalSha256Unchanged':True,
                            'alphaMin':0,'alphaMax':255},
        })
    result={'schemaVersion':1,'method':'local deterministic Python Pillow; manual contours; no generative model',
            'script':'scripts/cutout-saldens-epica.py','images':entries}
    MANIFEST.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'count':len(entries),'manifest':str(MANIFEST.relative_to(ROOT)),
                      'bytes':sum((ROOT/'public'/e['image'].lstrip('/')).stat().st_size for e in entries),
                      'reviewStatus':entries[0]['reviewStatus']}))


if __name__ == '__main__':
    main()
