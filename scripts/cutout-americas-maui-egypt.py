#!/usr/bin/env python3
"""Deterministic alpha-only product extraction; originals and all decoded RGB preserved.
Run from a clone with Pillow + numpy: python3 scripts/cutout-americas-maui-egypt.py
Manual contours are [y,left,right] in referenceSize pixels, reviewed against the source.
No generative models, RGB painting, invented edges, or source overwrites.
"""
from pathlib import Path
import argparse,hashlib,json,datetime
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'public/images/regional/cutouts'
EVIDENCE=ROOT/'.runtime/regional-evidence/cutouts-americas-maui-egypt'
PROFILES={
'cabesas-scottish':[(103,529,565),(105,513,579),(110,501,590),(118,494,598),(134,489,602),(150,489,601),(163,493,598),(171,498,594),(196,493,599),(230,486,606),(282,476,616),(341,470,625),(389,463,634),(408,454,646),(433,435,667),(461,419,683),(492,406,695),(523,401,700),(572,402,702),(898,404,703),(945,409,700),(969,418,692),(984,435,679),(993,461,652),(997,506,608)],
'cabesas-atomica':[(98,588,620),(100,571,639),(106,557,652),(118,546,662),(135,540,666),(150,539,668),(161,543,665),(176,551,659),(200,546,664),(242,538,673),(299,529,683),(350,523,689),(399,516,697),(427,510,703),(450,493,720),(474,476,739),(504,457,759),(540,445,773),(569,441,778),(595,442,779),(1031,450,781),(1067,458,775),(1085,476,758),(1095,500,737),(1101,541,700)],
'cabesas-sabotaje':[(139,781,826),(142,753,853),(150,733,869),(166,721,881),(184,716,888),(201,715,887),(216,722,881),(236,731,873),(267,725,879),(313,716,890),(375,704,903),(447,693,913),(508,688,922),(566,679,929),(593,670,938),(620,652,956),(651,631,979),(683,611,999),(715,598,1017),(747,590,1026),(792,588,1030),(1331,591,1033),(1384,598,1028),(1421,615,1011),(1444,641,988),(1456,673,955),(1464,723,904)],
'maui-light':[(20,378,910),(21,373,915),(25,369,918),(31,367,920),(44,367,919),(50,374,913),(52,371,916),(72,371,916),(84,364,922),(105,351,936),(131,335,953),(157,319,969),(175,311,977),(189,308,979),(1186,309,979),(1196,317,971),(1206,335,953),(1220,362,925),(1233,378,910),(1247,390,897),(1254,401,886),(1257,447,842)],
'maui-omg':[(26,377,909),(28,371,916),(33,368,918),(49,368,918),(55,374,913),(58,371,916),(78,371,916),(92,362,925),(116,347,941),(141,331,957),(165,316,972),(181,309,978),(192,307,979),(1188,309,978),(1198,318,969),(1210,339,951),(1225,369,921),(1240,384,905),(1253,399,890),(1259,447,842)],
'maui-rainbows':[(4,90,217),(5,88,220),(10,87,220),(13,89,219),(16,86,222),(23,82,227),(32,76,232),(41,72,234),(47,71,234),(285,72,234),(290,77,230),(294,84,225),(299,90,218),(303,97,212),(305,113,196)],
'sakara-gold':[(8,396,412),(9,390,418),(12,384,422),(18,383,423),(24,386,420),(29,387,418),(43,384,420),(63,380,422),(89,377,426),(114,373,430),(137,369,435),(156,362,443),(179,356,449),(198,354,451),(369,354,451),(387,355,450),(396,362,446),(400,376,433)]}
SPECS=[
{'stem':'cabesas-scottish','ext':'jpg','beerId':'regional-cabesas-scottish','referenceSize':[1080,1080]},
{'stem':'cabesas-atomica','ext':'jpg','beerId':'regional-cabesas-atomica','referenceSize':[1200,1200]},
{'stem':'cabesas-sabotaje','ext':'jpg','beerId':'regional-cabesas-sabotaje','referenceSize':[1600,1600]},
{'stem':'sierra-andina-inti','ext':'webp','beerId':'regional-sierra-andina-inti','roi':[470,140,730,890]},
{'stem':'sierra-andina-huaracina','ext':'webp','beerId':'regional-sierra-andina-huaracina','roi':[460,95,735,910]},
{'stem':'maui-light','ext':'jpg','beerId':'regional-maui-light','referenceSize':[980,1318],'edgeLimited':True},
{'stem':'maui-omg','ext':'jpg','beerId':'regional-maui-omg','referenceSize':[980,1318],'edgeLimited':True},
{'stem':'maui-rainbows','ext':'png','beerId':'regional-maui-rainbows','referenceSize':[235,316],'edgeLimited':True},
{'stem':'sakara-gold','ext':'jpg','beerId':'regional-sakara-gold','referenceSize':[640,410]}
]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def manual_alpha(size,profile,ref):
 scale=4; w,h=size; sx=w/ref[0];sy=h/ref[1]
 coords=[(left*sx,y*sy) for y,left,right in profile]+[(right*sx,y*sy) for y,left,right in reversed(profile)]
 m=Image.new('L',(w*scale,h*scale),0);ImageDraw.Draw(m).polygon([(round(x*scale),round(y*scale)) for x,y in coords],fill=255)
 return m.resize((w,h),Image.Resampling.LANCZOS),{'referenceSize':ref,'rowProfileYLeftRight':profile,'supersampling':scale,'resampling':'LANCZOS','rgbModification':False}
def white_roi_alpha(im,roi):
 # Narrow, reviewed ROI contains only bottle + white backdrop, excludes footer graphic.
 # Scanline silhouette fills highlights inside the bottle rather than deleting white label pixels.
 a=np.asarray(im.convert('RGB'));x0,y0,x1,y1=roi;profile=[]
 for y in range(y0,y1):
  row=a[y,x0:x1];fg=np.where(np.min(row,axis=1)<240)[0]
  if len(fg)>=3:profile.append((y,x0+int(fg[0]),x0+int(fg[-1])))
 if not profile:raise ValueError('Empty foreground')
 # Median-filter only jagged JPEG/WebP boundary noise, never alter interior RGB.
 left=[p[1] for p in profile];right=[p[2] for p in profile]
 clean=[(p[0],int(np.median(left[max(0,i-1):i+2])),int(np.median(right[max(0,i-1):i+2]))) for i,p in enumerate(profile)]
 alpha,params=manual_alpha(im.size,clean,list(im.size));params={'roi':roi,'backgroundThreshold':240,'minForegroundPixelsPerRow':3,'boundaryMedianRows':3,'supersampling':4,'scanlineCount':len(clean),'rgbModification':False}
 return alpha,params

def checker(im,thumbsize=(300,500)):
 c=im.copy();c.thumbnail(thumbsize,Image.Resampling.LANCZOS);w,h=c.size
 b=Image.new('RGB',c.size);d=ImageDraw.Draw(b)
 for y in range(0,h,14):
  for x in range(0,w,14):d.rectangle((x,y,x+13,y+13),fill=(205,205,205) if (x//14+y//14)%2 else (244,244,244))
 b.paste(c,(0,0),c.getchannel('A'));return b

def main():
 p=argparse.ArgumentParser();p.add_argument('--approved',action='store_true',help='Use only after visual review of this exact source hash and contour.');args=p.parse_args()
 OUT.mkdir(parents=True,exist_ok=True);EVIDENCE.mkdir(parents=True,exist_ok=True)
 records=[];previews=[]
 for s in SPECS:
  src=ROOT/'public/images/regional'/f"{s['stem']}.{s['ext']}";im=Image.open(src).convert('RGBA');original=np.asarray(im)
  if 'roi'in s:alpha,params=white_roi_alpha(im,s['roi']);method='white_background_roi_scanline_silhouette'
  else:alpha,params=manual_alpha(im.size,PROFILES[s['stem']],s['referenceSize']);method='manually_reviewed_alpha_contour'
  # Honor any transparency already in original PNG; no removed pixel becomes more opaque.
  alpha=Image.fromarray(np.minimum(np.asarray(alpha),original[:,:,3]).astype('uint8'))
  out=im.copy();out.putalpha(alpha);dest=OUT/f"{s['stem']}-cutout.png";out.save(dest)
  arr=np.asarray(Image.open(dest).convert('RGBA'));assert np.array_equal(arr[:,:,:3],original[:,:,:3]),'RGB changed'
  bbox=alpha.getbbox();assert bbox and alpha.getextrema()==(0,255)
  av=np.asarray(alpha); binary=Image.fromarray((av>=16).astype('uint8')*255).copy()
  ys,xs=np.where(av==255); middle=len(xs)//2
  ImageDraw.floodfill(binary,(int(xs[middle]),int(ys[middle])),128,thresh=0)
  detached=int(np.sum(np.asarray(binary)==255));assert detached==0, f'Detached visible alpha pixels: {detached}'
  x,y,x1,y1=bbox;stem=s['stem'];limits=[]
  if s.get('edgeLimited'):limits.append('Source can reaches right canvas boundary; possibly clipped thin right edge is retained as supplied, never reconstructed. Top, bottom and front label remain visible.')
  record={'beerId':s['beerId'],'sourceImage':'/images/regional/'+src.name,'sourceSha256':digest(src),'image':'/images/regional/cutouts/'+dest.name,'imageSha256':digest(dest),'width':im.width,'height':im.height,'alphaBounds':{'x':x,'y':y,'width':x1-x,'height':y1-y},'method':method,'parameters':params,'reviewStatus':'approved' if args.approved else 'pending_visual_review','reviewedAt':'2026-10-02' if args.approved else None,'rgbPreserved':True,'sourceCanvasPreserved':True,'alphaAudit':{'visibleThreshold':16,'detachedForegroundPixels':detached,'transparentPixels':int(np.sum(av==0)),'opaquePixels':int(np.sum(av==255))},'limitations':limits,'sourceTouchesCanvasEdge':bool(s.get('edgeLimited'))}
  records.append(record)
  # Review only: crop to extracted bounding box + 8 px context, show actual alpha on checkerboard.
  crop=out.crop((max(0,x-8),max(0,y-8),min(im.width,x1+8),min(im.height,y1+8)))
  prev=checker(crop);pp=EVIDENCE/f'{stem}-checker.png';prev.save(pp);previews.append((stem,prev))
  print(stem,record['alphaBounds'],dest.stat().st_size,flush=True)
 report={'metadata':{'id':'cutouts-americas-maui-egypt-2026-10-02','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'Local deterministic alpha masks, manual contours and white-background scanline extraction; no RGB edits or generative processing.','script':'scripts/cutout-americas-maui-egypt.py','dependencies':['Python 3','Pillow','numpy'],'images':len(records)},'images':records}
 path=ROOT/'research/regional-expansion-2026-10-02/cutouts-americas-maui-egypt.json';path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 for offset in range(0,len(previews),3):
  selected=previews[offset:offset+3];sheet=Image.new('RGB',(960,550),(234,236,238));d=ImageDraw.Draw(sheet)
  for col,(name,img) in enumerate(selected):sheet.paste(img,(col*320+(320-img.width)//2,35));d.text((col*320+8,8),name,fill=(0,0,0))
  sheet.save(EVIDENCE/f'review-{offset//3+1}.png')
if __name__=='__main__':main()
