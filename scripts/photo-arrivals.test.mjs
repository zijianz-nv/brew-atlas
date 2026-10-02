import test from 'node:test';import assert from 'node:assert/strict';
import {admitArrivingPhotos} from '../src/photo-arrivals.mjs';
const place=(id,x,y=50)=>({id,lat:y,lng:x,photoBeers:[{id:`${id}-beer`},{id:`${id}-second`} ]});
const base={anchors:new Map(),attachedIds:new Set(),occupiedRects:[],project:(lat,lng)=>({x:lng,y:lat,visible:true}),
  landMask:{intersectsRect:()=>true},geographicLand:{contains:()=>true},photoSize:{photoWidth:10,photoHeight:20},width:300,height:200,now:()=>0};
test('newly visible breweries get representative photographs without a settled layout',()=>{
 const photos=admitArrivingPhotos({...base,places:[place('a',50),place('b',100)]});
 assert.deepEqual(photos.map(p=>p.beer.id),['a-beer','b-beer']);assert.equal(photos[0].anchor.lng,50);
});
test('arrival never moves an offshore source or crosses the hidden hemisphere',()=>{
 assert.equal(admitArrivingPhotos({...base,places:[place('a',50)],geographicLand:{contains:()=>false}}).length,0);
 assert.equal(admitArrivingPhotos({...base,places:[place('a',50)],project:()=>({x:50,y:50,visible:false})}).length,0);
});
test('already connected images, occupied frames, overlays and all-water rectangles are not duplicated',()=>{
 const p=place('a',50);
 assert.equal(admitArrivingPhotos({...base,places:[p],attachedIds:new Set(p.photoBeers.map(b=>b.id))}).length,0);
 const rect={left:45,right:55,top:40,bottom:60};
 for(const extra of [{occupiedRects:[rect]},{obstacles:[rect]},{landMask:{intersectsRect:()=>false}}])
 assert.equal(admitArrivingPhotos({...base,places:[p],...extra}).length,0);
});
test('returning photographs retain their own exact geographic anchor',()=>{
 const anchor={lat:65,lng:70,sourceLat:50,sourceLng:50,sourceId:'a'};
 const [result]=admitArrivingPhotos({...base,places:[place('a',50)],anchors:new Map([['a-beer',anchor]])});
 assert.equal(result.anchor,anchor);assert.equal(result.point.x,70);assert.equal(result.point.y,65);
});
test('admission work is bounded by both count and time budget',()=>{
 const places=Array.from({length:10},(_,i)=>place(`a${i}`,20+i*22));
 assert.equal(admitArrivingPhotos({...base,places,limit:2}).length,2);
 let clock=0;assert.equal(admitArrivingPhotos({...base,places,now:()=>clock++,budgetMs:1}).length,1);
});
test('transiently overlapping old photos still block new admissions',()=>{
 const occupiedRects=[{left:20,right:30,top:40,bottom:60},{left:27,right:37,top:40,bottom:60}];
 assert.equal(admitArrivingPhotos({...base,places:[place('new',39)],occupiedRects}).length,0);
});
test('round-robin admission reaches later sources even if every pass exhausts its time budget',()=>{
 const places=[place('a',50),place('b',100),place('c',150)],seen=[];let cursor=0;
 for(let pass=0;pass<3;pass++){
  let clock=0;const result=admitArrivingPhotos({...base,places,cursor,onCursor:value=>{cursor=value;},now:()=>clock+=10,budgetMs:1});
  seen.push(result[0].beer.id);
 }
 assert.deepEqual(seen,['a-beer','b-beer','c-beer']);
});
