#!/usr/bin/env python3
"""Preserve the original atlas relief, changing only its subdued color palette.
Usage: python scripts/build-terrain-texture.py GRAY_LR_SR_W.tif nasa-world-topo-200407.jpg
NASA colors supply a softly blended sand/snow color guide only, not photo texture.
"""
import hashlib,json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]);guide=Path(sys.argv[2]);Image.MAX_IMAGE_PIXELS=None
gray=Image.open(source).convert('L');natural=Image.open(guide).convert('RGB')
features=json.loads((ROOT/'public/maps/world-50m.geojson').read_text())['features']
metadata={'source':'Natural Earth Gray Earth with Shaded Relief, Hypsography, and Flat Water v3.2.0',
 'sourceUrl':'https://naturalearth.s3.amazonaws.com/10m_raster/GRAY_LR_SR_W.zip',
 'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
 'paletteGuide':{'credit':'NASA Earth Observatory, Blue Marble Next Generation with Topography, July 2004',
 'sourceUrl':'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg',
 'sha256':hashlib.sha256(guide.read_bytes()).hexdigest()},
 'projection':'equirectangular, longitude -180 to 180, latitude 90 to -90',
 'processing':'Original Natural Earth relief recolored to a muted neutral atlas palette, with readable blue oceans. Smoothed historic land colors guide subtle sand and snow tints, not authoritative land-cover classification. No satellite photographic texture is displayed. Shaded raster, not 3D elevation or live weather.',
 'license':'Natural Earth public domain; NASA Earth Observatory reuse policy for palette guide', 'outputs':[]}
for width in [2048,4096]:
 height=width//2
 relief=np.asarray(gray.resize((width,height),Image.Resampling.LANCZOS))
 rgb=np.asarray(natural.resize((width,height),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(width/1024)),dtype='float32')/255
 # Same relief structure as the original. Low saturation helps the brighter
 # green leaves, golden grain and red fruit stand apart from the land.
 stops=np.array([0,100,155,180,204,226,255])
 colors=np.array([[33,47,50],[43,60,61],[55,74,70],[70,89,80],[86,103,88],[121,132,109],[186,189,164]])
 lut=np.array([np.interp(np.arange(256),stops,colors[:,channel]) for channel in range(3)]).T
 land=lut[relief]
 red,green,blue=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
 sand=np.clip((red-green-.005)/.08,0,1)*np.clip((green-blue-.012)/.10,0,1)*np.clip((red-.23)/.2,0,1)
 sand=np.asarray(Image.fromarray((sand*255).astype('uint8')).filter(ImageFilter.GaussianBlur(width/700)))/255
 sand_color=np.array([139,126,98])+(relief[:,:,None].astype('float32')-180)*.22
 land=land*(1-sand[:,:,None]*.70)+sand_color*sand[:,:,None]*.70
 snow=np.clip((np.minimum(np.minimum(red,green),blue)-.67)/.25,0,1)
 land=land*(1-snow[:,:,None]*.6)+np.array([184,192,185])*snow[:,:,None]*.6
 mask=Image.new('L',(width,height));borders=Image.new('RGBA',(width,height));border_draw=ImageDraw.Draw(borders)
 project=lambda ring:[((p[0]+180)/360*width,(90-p[1])/180*height) for p in ring]
 for feature in features:
  geo=feature['geometry'];polygons=[geo['coordinates']] if geo['type']=='Polygon' else geo['coordinates']
  for polygon in polygons:
   if not polygon:continue
   part=Image.new('L',(width,height));draw=ImageDraw.Draw(part);draw.polygon(project(polygon[0]),fill=255)
   for ring in polygon[1:]:draw.polygon(project(ring),fill=0)
   mask.paste(255,mask=part)
   for ring in polygon:border_draw.line(project(ring),fill=(172,191,171,55),width=1)
 ocean=np.zeros((height,width,3),dtype='uint8')
 for row in range(height):
  mid=1-abs(row-height/2)/(height/2);ocean[row,:,:]=[21+4*mid,47+10*mid,66+13*mid]
 result=Image.fromarray(np.where(np.asarray(mask)[:,:,None]>0,np.clip(land,0,255).astype('uint8'),ocean)).convert('RGBA')
 result=Image.alpha_composite(result,borders).convert('RGB');output=ROOT/f'public/maps/earth-terrain-{width}.webp';result.save(output,'WEBP',quality=88,method=6)
 metadata['outputs'].append({'file':output.name,'width':width,'height':height,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
(ROOT/'public/maps/earth-terrain.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n');print(json.dumps(metadata['outputs'],indent=2))
