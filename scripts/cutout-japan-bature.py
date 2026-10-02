#!/usr/bin/env python3
"""Reproduce ten manually traced product cutouts without changing source RGB.

Requires Pillow. Polygon coordinates are in each original image's pixel space.
The full canvas is retained. Only alpha changes; original source files are read-only.
Review each output on contrasting backgrounds after any contour/source change.
"""
from pathlib import Path
import argparse, hashlib, json
from PIL import Image, ImageDraw, ImageChops
ROOT=Path(__file__).resolve().parents[1]
DATE='2026-10-02'
POLYGONS={
'japan-abashiri-premium':[(61,54),(62,52),(68,51.5),(85,51.3),(91,52.8),(92.5,56),(92.5,65),(91,68),(90,70),(90.5,77),(92,87),(95,108),(97,126),(97,140),(98.5,145),(106,153),(110,160),(112,168),(112.5,184),(112.2,210),(112.5,252),(112.5,283),(111,289),(106,292),(96,294),(81,295),(64,294.5),(50,293),(42,291),(40,287),(39.6,268),(39.5,239),(39.8,209),(39.8,183),(40,169),(42,161),(46,155),(51,149),(55,145),(56,139),(56,122),(57,106),(59,90),(61,79),(61.8,69),(60.5,66),(60.3,61),(61,58)],
'japan-abashiri-stout':[(157,51),(158.5,48),(164,47),(178,46.5),(188,47),(191,51),(191,59),(190,62),(189,64),(190,75),(192,91),(195,112),(196.2,137),(197,147),(200,151),(204,156),(209,163),(211,172),(212.5,187),(213.5,216),(213.5,270),(213,294),(211,305),(207,310),(199,313),(187,315),(176,315.8),(159,315),(146,312),(138,309),(135,305),(133.5,292),(132.4,259),(131.8,212),(132,183),(133.8,170),(138,160),(145,152),(149.5,147),(150.5,139),(150.5,114),(152,96),(155,78),(157,65),(155.8,62),(155.8,55)],
'japan-abashiri-golden':[(143,131),(149,130.5),(210,130.5),(219,131),(219,134.5),(218,135.5),(217.8,141),(220,147),(222.5,152),(223,161),(223,276),(221.7,282),(219,286),(215,289),(207,292),(195,294),(175,294.7),(159,293.5),(148,290),(141,286),(138.5,282),(138,273),(137.5,240),(137,206),(137,172),(137,152),(139,146),(141.5,140),(142,135),(141,134),(141,132.5)],
'japan-abashiri-artisan':[(139,126),(145,124.5),(178,123.6),(211,123.8),(221,124.7),(224,126.5),(224,129),(222.5,130),(222.5,134),(224,140),(228,147),(229,153),(229,291),(227.5,295),(223,299),(218,302),(211,305),(198,307.5),(177,307.7),(159,306.5),(148,304),(141,300.7),(136,297),(134.5,292),(134,265),(133.5,227),(133.3,195),(132.5,158),(133,148),(136,141),(139,135),(139.5,130),(138.2,129),(138.2,127)],
'japan-baeren-classic':[(345,14),(380,12.5),(427,13),(454,16),(468,22),(473,33),(474,48),(471,52),(471,59),(474,74),(478,91),(477,105),(473,115),(472,129),(473,156),(475,183),(480,202),(490,223),(503,248),(516,273),(522,297),(525,325),(525,345),(529,365),(538,383),(551,399),(564,417),(575,438),(583,460),(587,482),(588,513),(588,546),(589,599),(590,710),(590,830),(588,896),(584,922),(574,940),(560,952),(544,960),(520,967),(481,973),(434,976),(377,976),(338,974),(303,970),(277,964),(257,955),(242,943),(232,927),(226,907),(224,886),(224,791),(224,641),(224,529),(223,491),(225,467),(233,443),(244,423),(260,401),(272,382),(280,365),(283,345),(283,321),(284,297),(290,273),(300,246),(310,222),(321,202),(327,181),(331,154),(332,129),(332,116),(327,106),(325,92),(328,76),(334,59),(334,53),(327,51),(327,43),(330,30),(334,20)],
'japan-baeren-schwarz':[(347,18),(382,16),(422,17),(455,20),(466,26),(472,38),(473,54),(470,58),(471,67),(475,83),(477,99),(475,112),(472,122),(472,146),(473,174),(478,196),(486,216),(501,242),(513,268),(521,293),(524,322),(525,348),(530,368),(539,385),(552,401),(566,420),(576,442),(583,465),(586,488),(587,524),(588,597),(589,713),(589,831),(587,894),(583,920),(574,939),(560,951),(540,960),(513,966),(477,971),(432,974),(383,974),(339,972),(305,969),(280,963),(259,955),(242,943),(232,927),(226,906),(224,883),(224,787),(224,638),(224,530),(223,490),(225,467),(232,445),(242,425),(257,403),(271,383),(280,363),(283,342),(283,318),(285,294),(291,270),(301,244),(311,220),(321,200),(327,179),(331,152),(332,129),(332,119),(328,110),(325,96),(327,81),(332,64),(334,59),(327,57),(327,45),(331,30),(337,23)],
'japan-baeren-alt':[(349,27),(382,25),(421,26),(454,29),(467,34),(473,45),(474,61),(470,66),(470,74),(474,91),(477,105),(477,117),(473,129),(473,151),(474,177),(479,199),(490,224),(503,250),(514,276),(521,301),(524,330),(525,351),(530,373),(540,391),(553,408),(567,428),(577,450),(583,472),(587,496),(588,532),(589,606),(590,719),(590,838),(588,901),(583,930),(574,948),(559,960),(539,968),(512,975),(476,980),(432,983),(382,983),(340,981),(306,977),(279,971),(257,962),(241,950),(232,934),(227,915),(225,889),(225,795),(224,647),(224,543),(224,501),(226,477),(233,453),(244,432),(258,411),(272,391),(280,371),(284,350),(285,324),(287,300),(294,276),(304,251),(314,228),(324,208),(330,187),(334,162),(336,142),(336,132),(332,123),(329,110),(330,96),(335,78),(338,69),(331,66),(331,56),(334,42),(340,32)],
}
CAN=[(405,341),(389,344),(378,348),(373,353),(373,364),(377,369),(380,372),(377,381),(367,394),(357,410),(352,421),(350,434),(349,876),(351,889),(359,901),(374,913),(393,920),(424,924),(472,927),(529,927),(574,925),(606,920),(624,913),(637,904),(647,891),(653,879),(654,437),(653,423),(648,411),(640,399),(628,382),(624,373),(627,368),(632,364),(632,353),(627,348),(616,344),(600,341),(560,338),(517,337),(465,338)]
for n in ['black','lager','haze']:POLYGONS['gap-bature-'+n]=CAN

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def process(review_status='pending'):
    source_records={}
    for file in ['japan-extra.json','gap-fill-asia-africa.json']:
        for beer in json.loads((ROOT/'research/regional-expansion-2026-10-02'/file).read_text())['beers']:
            source_records[Path(beer['imageOriginal']).stem]=beer
    outdir=ROOT/'public/images/regional/cutouts';outdir.mkdir(parents=True,exist_ok=True)
    records=[]
    for stem,points in POLYGONS.items():
        beer=source_records[stem];source=ROOT/'public'/beer['imageOriginal'].lstrip('/');source_sha=sha(source)
        assert source_sha==beer['imageEvidence']['sha256'],f'Source hash changed: {stem}'
        image=Image.open(source).convert('RGBA');w,h=image.size
        mask=Image.new('L',(w*8,h*8));ImageDraw.Draw(mask).polygon([(round(x*8),round(y*8))for x,y in points],fill=255)
        mask=mask.resize((w,h),Image.Resampling.BOX)
        alpha=ImageChops.multiply(image.getchannel('A'),mask);cut=image.copy();cut.putalpha(alpha)
        assert ImageChops.difference(cut.convert('RGB'),image.convert('RGB')).getbbox() is None
        assert ImageChops.subtract(alpha,image.getchannel('A')).getbbox() is None
        target=outdir/(stem+'-cutout.png');cut.save(target,optimize=True)
        loaded=Image.open(target).convert('RGBA');assert ImageChops.difference(loaded.convert('RGB'),image.convert('RGB')).getbbox() is None
        bbox=alpha.getbbox();area=sum(alpha.histogram()[1:])
        assert bbox and area<(bbox[2]-bbox[0])*(bbox[3]-bbox[1])*.97, f'Rectangular mask suspicious: {stem}'
        records.append({'beerId':beer['id'],'sourceImage':beer['imageOriginal'],'sourceSha256':source_sha,'image':'/images/regional/cutouts/'+target.name,'imageSha256':sha(target),'width':w,'height':h,'alphaBounds':{'x':bbox[0],'y':bbox[1],'width':bbox[2]-bbox[0],'height':bbox[3]-bbox[1]},'method':'manual_product_contour_alpha_mask','parameters':{'contour':points,'coordinateSpace':'original_canvas_pixels','antialiasSupersample':8,'downsample':'Pillow BOX coverage','alphaCombination':'original_alpha * coverage_mask / 255','rgbProcessing':'none; decoded source RGB copied at every original-canvas pixel','fullCanvasRetained':True,'feathering':'none','backgroundAndGlassRemoved':True},'validation':{'rgbByteValuesEqualDecodedSource':True,'alphaNeverIncreased':True,'nonzeroAlphaPixels':area,'nonRectangularAlpha':True},'reviewStatus':review_status,'reviewedAt':DATE if review_status=='approved' else None})
    result={'metadata':{'createdAt':DATE,'sourcePolicy':'Original files preserved. No reconstruction, generative fill, recoloring, label edits or product deformation. Transparent alpha only; manual contours include complete cap/rim/base.','script':'scripts/cutout-japan-bature.py','reviewEvidence':['.runtime/regional-evidence/cutouts-japan-bature/cutouts-light.png','.runtime/regional-evidence/cutouts-japan-bature/cutouts-dark.png']},'images':records}
    dest=ROOT/'research/regional-expansion-2026-10-02/cutouts-japan-bature.json';dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(f'{len(records)} cutouts -> {dest}')
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--reviewed',action='store_true',help='Use only after visual review of the fixed contours on light and dark backgrounds.');args=ap.parse_args();process('approved' if args.reviewed else 'pending')
