import {createPhotoOccupancy} from './photo-overlap.mjs';
import {photoTouchesLand} from './marker-layout.mjs';

/** A small admission pass, not another layout. New photographs start exactly
 * at their brewery; previously visited photographs reuse their geographic
 * anchor. No screen raster, coastal search, or displacement during a drag. */
export function admitArrivingPhotos({places, anchors, attachedIds, occupiedRects,
  project, landMask, geographicLand, photoSize, width, height, obstacles=[],
  leftMargin=8, rightMargin=8, topMargin=8, bottomMargin=12, limit=6,
  now=()=>performance.now(), budgetMs=3,cursor=0,onCursor}={}) {
  const started=now(), occupancy=createPhotoOccupancy(), admitted=[], blockedExisting=[];
  // Old photos can overlap transiently during motion. A failed reservation
  // must not make one disappear from the new-photo collision checks.
  for(const rect of occupiedRects)if(!occupancy.add(rect))blockedExisting.push(rect);
  const bounds={left:leftMargin,right:width-rightMargin,top:topMargin,bottom:height-bottomMargin};
  const {photoWidth:w,photoHeight:h}=photoSize;
  const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  for(let step=0;step<places.length;step++){
    if(admitted.length>=limit||(step>0&&now()-started>=budgetMs))break;
    const index=(cursor+step)%places.length,place=places[index];
    onCursor?.((index+1)%places.length);
    const source=project(place.lat,place.lng);
    if(!source?.visible||source.x<bounds.left||source.x>bounds.right||source.y<bounds.top||source.y>bounds.bottom)continue;
    for(const beer of place.photoBeers){
      if(attachedIds.has(beer.id))continue;
      const previous=anchors.get(beer.id);
      // If the actual source is ambiguous/offshore, let the precise settled
      // placement handle it. Never snap an island onto a distant continent.
      if(!previous&&!geographicLand.contains(place.lng,place.lat))break;
      const anchor=previous||{lat:place.lat,lng:place.lng,sourceLat:place.lat,sourceLng:place.lng,
        sourceId:place.id,reach:0,screenDistance:0};
      const point=previous?project(anchor.lat,anchor.lng):source;
      if(!point?.visible)continue;
      const rect={left:point.x-w/2,right:point.x+w/2,top:point.y-h/2,bottom:point.y+h/2};
      if(rect.left<bounds.left||rect.right>bounds.right||rect.top<bounds.top||rect.bottom>bounds.bottom
        ||obstacles.some(box=>overlaps(rect,box))||blockedExisting.some(box=>overlaps(rect,box))
        ||!photoTouchesLand(landMask,rect)||!occupancy.add(rect)){
        if(!previous)break; // All unvisited photos of this source share this point.
        continue;
      }
      admitted.push({beer,place,anchor,point,source,rect});
      break; // Give every newly visible brewery a chance before adding seconds.
    }
  }
  return admitted;
}
