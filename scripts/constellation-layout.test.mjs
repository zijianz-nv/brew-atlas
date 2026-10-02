import test from 'node:test';
import assert from 'node:assert/strict';
import {createConstellationLayout,createConstellationRingLayout} from '../src/constellation-layout.mjs';
import {ZODIAC_CONSTELLATIONS} from '../src/celestial-stars.mjs';
import {minimumSkyScale} from '../src/celestial-orbits.mjs';
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
function verifyPairedRows(signs,width,centerY){
 const top=signs.filter(s=>s.layoutRow==='top'),bottom=signs.filter(s=>s.layoutRow==='bottom');
 assert.equal(top.length,4);assert.equal(bottom.length,4);
 for(let i=0;i<4;i++){
  assert(Math.abs(top[i].x+top[i].width/2-bottom[i].x-bottom[i].width/2)<1e-8,'opposing rows share X centers');
  assert(Math.abs(top[i].y+top[i].height/2+bottom[i].y+bottom[i].height/2-2*centerY)<1e-8,'opposing row centers mirror Earth');
 }
 assert(Math.abs(centerY-Math.max(...top.map(s=>s.y+s.height))-(Math.min(...bottom.map(s=>s.y))-centerY))<1e-8,'both rows leave the same inner visual gap');
 assert(Math.abs(top[0].x+top[0].width/2+top[3].x+top[3].width/2-width)<1e-8);
}

function verify(options,expected=12){
 const signs=createConstellationLayout(options);assert.equal(signs.length,expected);
 assert.equal(new Set(signs.map(s=>s.id)).size,signs.length);
 for(const [i,sign] of signs.entries()){
  assert(sign.x>=0&&sign.y>=0&&sign.x+sign.width<=options.width&&sign.y+sign.height<=options.height);
  for(const other of signs.slice(i+1))assert(!overlaps(sign.bbox,other.bbox),`${sign.id}/${other.id} overlap`);
  for(const exclusion of options.exclusions||[])assert(!overlaps(sign.bbox,exclusion),`${sign.id} obstructs reserved body/control`);
  assert(sign.label.bbox.bottom<=sign.bbox.bottom);
  const source=ZODIAC_CONSTELLATIONS.find(s=>s.id===sign.id);
  assert.equal(sign.stars.length,source.stars.length);assert.equal(sign.segments.length,source.lines.reduce((sum,line)=>sum+line.length-1,0));
  assert.equal(sign.starEmphasis,sign.id==='Lib'||sign.id==='Sco');
  for(const star of sign.stars)assert(star.x>=sign.bbox.left&&star.x<=sign.bbox.right&&star.y>=sign.bbox.top&&star.y<sign.label.bbox.top);
 }
 return signs;
}
test('twelve irregular desktop figures avoid the Earth/planets and controls, deterministically',()=>{
 const options={width:1440,height:900,exclusions:[{left:530,top:300,right:910,bottom:620},{left:15,top:15,right:240,bottom:100},{left:0,top:840,right:1440,bottom:900}]};
 const a=verify(options);assert.deepEqual(a,createConstellationLayout(options));
 assert.notDeepEqual(a,createConstellationLayout({...options,seed:'another'}));
 assert(new Set(a.map(s=>Math.round(s.x))).size>9);assert(new Set(a.map(s=>Math.round(s.y))).size>9);
});
test('340x500 mobile still fits all twelve with central body and top/bottom controls',()=>{
 verify({width:340,height:500,exclusions:[{left:125,top:185,right:215,bottom:280},{left:8,top:8,right:180,bottom:40},{left:0,top:455,right:340,bottom:500}]});
 verify({width:390,height:844,exclusions:[{left:125,top:325,right:265,bottom:485},{left:8,top:8,right:200,bottom:50},{left:0,top:784,right:390,bottom:844}]});
});
test('Pisces RA seam unwrap preserves the short shape; all segment endpoints are source stars',()=>{
 const p=verify({width:900,height:700}).find(s=>s.id==='Psc');
 const byId=new Map(p.stars.map(s=>[s.id,s]));
 for(const segment of p.segments){const a=byId.get(segment.fromId),b=byId.get(segment.toId);assert.equal(segment.x1,a.x);assert.equal(segment.y1,a.y);assert.equal(segment.x2,b.x);assert.equal(segment.y2,b.y);}
 const left=byId.get('HIP 113889'),right=byId.get('HIP 9487');assert(left.x>right.x);
 assert(Math.max(...p.stars.map(s=>s.x))-Math.min(...p.stars.map(s=>s.x))<150);
});
test('fully excluded or invalid viewport returns safely without forcing overlapping constellations',()=>{
 assert.deepEqual(createConstellationLayout({width:340,height:500,exclusions:[{x:0,y:0,width:340,height:500}]}),[]);
 assert.deepEqual(createConstellationLayout({width:0,height:500}),[]);
});
test('desktop ring keeps clock order and Libra/Scorpius precisely level with Earth',()=>{
 const order=['Ari','Tau','Gem','Sco','Cnc','Leo','Vir','Sgr','Cap','Lib','Aqr','Psc'];
 for(const width of [1440,1720]){
  const height=990,centerY=450;
  const exclusions=[{left:width/2-40,top:centerY-55,right:width/2+40,bottom:centerY+45},{left:8,top:8,right:180,bottom:40}];
  const options={width,height,centerY,exclusions},signs=createConstellationRingLayout(options);
  assert.deepEqual(signs.map(s=>s.id),order);assert.deepEqual(signs,createConstellationRingLayout(options));
  for(const [i,s] of signs.entries()){
   for(const b of [...exclusions,...signs.slice(i+1).map(s=>s.bbox)])assert(!overlaps(s.bbox,b));
   if(['Lib','Sco'].includes(s.id)){assert.equal(s.y+s.height/2,centerY);assert.equal(s.x+s.width/2<width/2,s.id==='Lib');}
  }
 }
});
test('desktop constellations form one true circle at full, tall and short viewport heights',()=>{
 for(const [width,stageHeight,earthRadius]of [[1440,670,330],[1720,920,430],[1280,490,260]]){
  const height=stageHeight+90,centerY=stageHeight/2,r=earthRadius*.22+8;
  const exclusions=[{x:width/2-r,y:centerY-r,width:r*2,height:r*2+18},{x:0,y:0,width:365,height:140},
   {x:width-80,y:stageHeight*.3,width:80,height:320},{x:width/2-155,y:height-58,width:310,height:58}];
  const signs=createConstellationRingLayout({width,height,centerY,exclusions});assert.equal(signs.length,12);
  let sharedRadius,sharedFigureSize;
  for(const [i,s]of signs.entries()){
   const dx=s.x+s.width/2-width/2,dy=s.y+s.height/2-centerY,radius=Math.hypot(dx,dy);
   sharedRadius??=radius;assert(Math.abs(radius-sharedRadius)<1e-8);
   assert(Math.abs(dx-radius*Math.sin(i*Math.PI/6))<1e-8);assert(Math.abs(dy+radius*Math.cos(i*Math.PI/6))<1e-8);
   const starWidth=Math.max(...s.stars.map(p=>p.x))-Math.min(...s.stars.map(p=>p.x));
   const starHeight=Math.max(...s.stars.map(p=>p.y))-Math.min(...s.stars.map(p=>p.y));
   sharedFigureSize??=Math.max(starWidth,starHeight);assert(Math.abs(Math.max(starWidth,starHeight)-sharedFigureSize)<1e-8);
   for(const box of [...exclusions.map(r=>({left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height})),...signs.slice(i+1).map(s=>s.bbox)])assert(!overlaps(s.bbox,box));
  }
  assert(sharedRadius<centerY); // Height, rather than the wide screen, sets the circle.
 }
});
test('mobile stars precede planets and retain aligned mirrored top/bottom rows with symmetric side groups',()=>{
 for(const {width,height,earthRadius} of [{width:424,height:588,earthRadius:254},{width:424,height:516,earthRadius:226.1},
  {width:409,height:484,earthRadius:217.9},{width:394,height:472,earthRadius:209},{width:374,height:472,earthRadius:199},{width:354,height:460,earthRadius:189}]){
 const skyHeight=height+90,centerY=height/2,scale=minimumSkyScale(width),r=earthRadius*scale+8;
 const exclusions=[{x:width/2-r,y:centerY-r,width:r*2,height:r*2+18},{x:0,y:0,width:310,height:58},
  {x:width-260,y:height-14,width:236,height:44},{x:width/2-155,y:skyHeight-58,width:310,height:58},
  {x:0,y:0,width:24,height:skyHeight},{x:width-24,y:0,width:24,height:skyHeight}];
 const signs=createConstellationRingLayout({width,height:skyHeight,centerY,exclusions});assert.equal(signs.length,12);verifyPairedRows(signs,width,centerY);
 for(const [i,s] of signs.entries()){
  for(const b of [...exclusions.map(r=>({left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height})),...signs.slice(i+1).map(s=>s.bbox)])assert(!overlaps(s.bbox,b));
  assert.equal(s.label.bbox.width,22);
 }
 const ids={top:['Psc','Ari','Tau','Gem'],bottom:['Cap','Sgr','Vir','Leo'],left:['Aqr','Lib'],right:['Sco','Cnc']};
 for(const [row,expected]of Object.entries(ids)){
  const group=signs.filter(s=>s.layoutRow===row);assert.deepEqual(group.map(s=>s.id),expected);
  const horizontal=row==='top'||row==='bottom';
  const centers=group.map(s=>({x:s.x+s.width/2,y:s.y+s.height/2}));
  for(const c of centers)assert(Math.abs((horizontal?c.y:c.x)-(horizontal?centers[0].y:centers[0].x))<1e-8);
  if(horizontal){assert(Math.abs((centers[0].x+centers[3].x)/2-width/2)<1e-8);assert(Math.abs((centers[1].x-centers[0].x)-(centers[2].x-centers[1].x))<1e-8);}
 }
 const left=signs.filter(s=>s.layoutRow==='left'),right=signs.filter(s=>s.layoutRow==='right');
 for(let i=0;i<2;i++){
  assert(Math.abs(left[i].y+left[i].height/2-right[i].y-right[i].height/2)<1e-8);
  assert(Math.abs(left[i].x+left[i].width/2+right[i].x+right[i].width/2-width)<1e-8);
 }
 }
});
test('mobile constellation-first layout keeps exact left/right symmetry around Earth and controls alone',()=>{
 const width=409,height=484,centerY=242,r=217.9*.3+8;
 const exclusions=[{x:width/2-r,y:centerY-r,width:r*2,height:r*2+18},{x:0,y:0,width:310,height:58},
  {x:width-260,y:height-14,width:236,height:44},{x:width/2-155,y:height+90-58,width:310,height:58},
  {x:0,y:0,width:24,height:height+90},{x:width-24,y:0,width:24,height:height+90}];
 const signs=createConstellationRingLayout({width,height:height+90,centerY,exclusions});assert.equal(signs.length,12);
 for(const [i,s]of signs.entries())for(const box of [...exclusions.map(r=>({left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height})),...signs.slice(i+1).map(s=>s.bbox)])assert(!overlaps(s.bbox,box));
 const left=signs.filter(s=>s.layoutRow==='left'),right=signs.filter(s=>s.layoutRow==='right');
 for(let i=0;i<2;i++){assert.equal(left[i].y+left[i].height/2,right[i].y+right[i].height/2);assert.equal(left[i].x+left[i].width/2+right[i].x+right[i].width/2,width);}
});
test('320x667 short phone keeps all twelve around the actual Earth and full-width heading',()=>{
 const width=354,stageHeight=339,height=stageHeight+90,centerY=stageHeight/2;
 const ratio=Math.min(width*.87,stageHeight*.87)/stageHeight;
 const altitude=Math.max(1.5,Math.min(4.8,Math.sqrt(1+1/(ratio*Math.tan(25*Math.PI/180))**2)-1))*.76;
 const earthRadius=stageHeight/(2*Math.tan(25*Math.PI/180)*Math.sqrt(altitude*(altitude+2))),r=earthRadius*.3+8;
 for(const headingHeight of [12,58]){
  const exclusions=[{x:width/2-r,y:centerY-r,width:r*2,height:r*2+18},{x:0,y:0,width,height:headingHeight},
   {x:width-260,y:stageHeight-14,width:236,height:44},{x:width/2-155,y:height-58,width:310,height:58},
   {x:0,y:0,width:24,height},{x:width-24,y:0,width:24,height}];
  const options={width,height,centerY,exclusions},signs=createConstellationRingLayout(options);
  assert.equal(signs.length,12,`all figures fit with ${headingHeight}px heading`);verifyPairedRows(signs,width,centerY);
  assert.deepEqual(signs,createConstellationRingLayout(options));
  for(const [i,s]of signs.entries()){
   assert(s.x>=0&&s.y>=0&&s.x+s.width<=width&&s.y+s.height<=height);
   for(const box of [...exclusions.map(r=>({left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height})),...signs.slice(i+1).map(s=>s.bbox)])assert(!overlaps(s.bbox,box));
   assert.equal(s.label.bbox.width,22);assert(s.label.bbox.bottom<=s.bbox.bottom);
   for(const star of s.stars)assert(star.y<s.label.bbox.top);
   const starSize=Math.max(Math.max(...s.stars.map(p=>p.x))-Math.min(...s.stars.map(p=>p.x)),Math.max(...s.stars.map(p=>p.y))-Math.min(...s.stars.map(p=>p.y)));
   assert(starSize>=12-1e-8&&starSize<=48+1e-8,'short-screen figures stay within the supported readable size range');
  }
  for(const row of ['top','bottom']){
   const group=signs.filter(s=>s.layoutRow===row),centers=group.map(s=>({x:s.x+s.width/2,y:s.y+s.height/2}));
   assert.equal(group.length,4);assert(centers.every(c=>Math.abs(c.y-centers[0].y)<1e-8));
   assert(Math.abs(centers[0].x+centers[3].x-width)<1e-8);assert(Math.abs(centers[1].x+centers[2].x-width)<1e-8);
  }
  const left=signs.filter(s=>s.layoutRow==='left'),right=signs.filter(s=>s.layoutRow==='right');
  assert.equal(left.length,2);assert.equal(right.length,2);
  for(let i=0;i<2;i++){assert(Math.abs(left[i].y+left[i].height/2-right[i].y-right[i].height/2)<1e-8);assert(Math.abs(left[i].x+left[i].width/2+right[i].x+right[i].width/2-width)<1e-8);}
 }
});
