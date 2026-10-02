#!/usr/bin/env python3
"""Reviewed foreground-container masks; preserve source RGB and full canvas.

Requires Pillow. The user explicitly requested local Python background
separation. Polygons follow the front can/bottle in each original group photo.
No label synthesis, RGB recolouring, rescaling or source overwriting is used.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
POLYGONS = {
    'usa-bells-hazy.png': [(110,270),(113,263),(128,259),(155,256),(191,253),(228,254),(261,257),(282,261),(292,266),(295,272),(294,282),(298,293),(305,307),(312,318),(316,326),(316,666),(310,677),(301,686),(289,694),(272,699),(247,702),(169,702),(140,700),(119,696),(108,691),(98,682),(90,667),(90,326),(92,318),(99,304),(105,291),(110,280)],
    'usa-bells-cold.png': [(111,284),(116,276),(135,272),(163,269),(198,267),(230,268),(256,271),(276,275),(288,282),(289,293),(296,309),(306,327),(312,338),(312,672),(306,683),(293,694),(281,700),(258,704),(159,704),(135,702),(117,697),(104,686),(93,675),(91,667),(92,339),(99,326),(106,310),(112,294)],
    'usa-bells-big.png': [(19,179),(24,173),(42,169),(68,166),(103,166),(128,168),(150,172),(158,178),(159,187),(164,198),(172,211),(175,222),(175,486),(170,493),(158,500),(140,504),(54,505),(32,503),(19,497),(8,490),(3,482),(3,220),(10,207),(17,191)],
    'usa-bells-eclipse.png': [(155,189),(159,181),(177,177),(203,173),(233,173),(263,175),(286,179),(301,185),(305,191),(304,198),(308,210),(316,225),(320,236),(321,506),(315,514),(302,523),(284,530),(202,531),(178,529),(162,524),(149,516),(140,507),(140,237),(143,228),(149,215),(155,201)],
    'meister-max-bottle.png': [(253,106),(257,102),(272,101),(287,102),(295,107),(298,116),(296,126),(293,133),(293,151),(299,178),(303,199),(303,219),(308,240),(318,265),(322,284),(325,310),(325,451),(322,468),(316,476),(305,480),(248,481),(234,478),(226,472),(222,461),(221,315),(225,290),(233,267),(240,245),(243,223),(242,205),(245,181),(248,163),(251,142),(252,127),(249,117)],
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run():
    catalog=json.loads((ROOT/'public/data/regional.json').read_text())
    by_image={b['image']:b for b in catalog['beers']}
    target=ROOT/'public/images/regional/cutouts'
    target.mkdir(parents=True,exist_ok=True)
    records=[]
    for name,points in POLYGONS.items():
        source=ROOT/'public/images/regional'/name
        original=Image.open(source).convert('RGBA')
        scale=4
        mask=Image.new('L',(original.width*scale,original.height*scale),0)
        ImageDraw.Draw(mask).polygon([(round(x*scale),round(y*scale)) for x,y in points],fill=255)
        mask=mask.resize(original.size,Image.Resampling.LANCZOS)
        mask=ImageChops.darker(mask,original.getchannel('A'))
        result=original.copy()
        result.putalpha(mask)
        output=target/(source.stem+'-cutout.png')
        result.save(output,optimize=True)
        assert result.convert('RGB').tobytes()==original.convert('RGB').tobytes()
        box=mask.getbbox()
        records.append({'beerId':by_image['/images/regional/'+name]['id'],
            'sourceImage':'/images/regional/'+name,'sourceSha256':sha(source),
            'image':'/images/regional/cutouts/'+output.name,'imageSha256':sha(output),
            'width':result.width,'height':result.height,'alphaBounds':{'x':box[0],'y':box[1],'width':box[2]-box[0],'height':box[3]-box[1]},
            'method':'reviewed_container_outline_alpha_mask','parameters':{'polygon':points,'supersampling':scale,'sourceAlphaPreserved':True},
            'rgbPixelsUnchanged':True,'reviewStatus':'approved','reviewedAt':'2026-10-02',
            'script':'scripts/extract-regional-front-products.py'})
    path=ROOT/'research/regional-expansion-2026-10-02/cutouts-front-products.json'
    path.write_text(json.dumps({'images':records},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'count':len(records),'manifest':str(path)}))

if __name__=='__main__':run()
