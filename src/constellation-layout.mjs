import {ZODIAC_CONSTELLATIONS} from './celestial-stars.mjs';

// Decorative placement preserves each figure's internal star geometry, not its
// absolute sky position. It runs only when the viewport/exclusions change.
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const wrap=degrees=>((degrees+180)%360+360)%360-180;
function randomFor(seed){
 let state=2166136261;
 for(const char of String(seed))state=Math.imul(state^char.charCodeAt(0),16777619);
 return ()=>{state+=0x6D2B79F5;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
}
function rect(value){
 const left=value?.left??value?.x,top=value?.top??value?.y;
 const right=value?.right??left+value?.width,bottom=value?.bottom??top+value?.height;
 return [left,top,right,bottom].every(Number.isFinite)&&right>left&&bottom>top?{left,top,right,bottom}:null;
}
const shapes=ZODIAC_CONSTELLATIONS.map(sign=>{
 const centerRa=sign.label.raDeg,centerDec=sign.stars.reduce((sum,s)=>sum+s.decDeg,0)/sign.stars.length;
 const points=sign.stars.map(star=>({x:-wrap(star.raDeg-centerRa)*Math.cos(centerDec*Math.PI/180),y:-star.decDeg}));
 const minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y));
 const width=Math.max(...points.map(p=>p.x))-minX,height=Math.max(...points.map(p=>p.y))-minY;
 return {sign,width,height,points:points.map(p=>({x:p.x-minX,y:p.y-minY}))};
});
function frame(shape,size,compactLabel=false){
 const scale=size/Math.max(shape.width,shape.height),starWidth=shape.width*scale,starHeight=shape.height*scale;
 // 12px label estimate deliberately over-reserves width, including Sagittarius.
 const labelWidth=compactLabel?22:shape.sign.name.length*7+6,labelHeight=compactLabel?12:16,padding=compactLabel?4:5,labelGap=compactLabel?4:7;
 return {shape,scale,starWidth,starHeight,labelWidth,labelHeight,padding,labelGap,
  width:Math.max(starWidth,labelWidth)+padding*2,height:starHeight+padding*2+labelGap+labelHeight};
}
function emit(item){
 const {shape,scale,starWidth,starHeight,labelWidth,labelHeight,padding,labelGap,x,y,width,height}=item;
 const stars=shape.sign.stars.map((star,i)=>({...star,x:x+(width-starWidth)/2+shape.points[i].x*scale,y:y+padding+shape.points[i].y*scale}));
 const segments=shape.sign.lines.flatMap(line=>line.slice(1).map((to,i)=>{
  const a=stars[line[i]],b=stars[to];return {x1:a.x,y1:a.y,x2:b.x,y2:b.y,fromId:a.id,toId:b.id};
 }));
 const labelTop=y+padding+starHeight+labelGap,labelX=x+width/2;
 return {id:shape.sign.id,name:shape.sign.name,starEmphasis:shape.sign.starEmphasis,x,y,width,height,
  bbox:{left:x,top:y,right:x+width,bottom:y+height,width,height},stars,segments,
  label:{x:labelX,y:labelTop+labelHeight-3,bbox:{left:labelX-labelWidth/2,top:labelTop,right:labelX+labelWidth/2,bottom:labelTop+labelHeight,width:labelWidth,height:labelHeight}}};
}

/** Absolute screen-pixel coordinates. Exclusions accept left/top/right/bottom
 * or x/y/width/height. Invalid sizes return []; crowded screens return the best
 * safe subset instead of overlapping figures, labels, or excluded controls. */
export function createConstellationLayout({width,height,exclusions=[],seed='zodiac'}={}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return [];
 const margin=8,gap=8,blocked=exclusions.map(rect).filter(Boolean);
 const baseSize=Math.min(130,Math.max(64,Math.min(width,height)*.14));
 const sizes=[baseSize,baseSize*.87,baseSize*.74,baseSize*.61,baseSize*.49,36].map(n=>Math.max(36,n));
 let best=[];
 for(const size of [...new Set(sizes)]){
  for(let attempt=0;attempt<3;attempt++){
   const random=randomFor(`${seed}:${size}:${attempt}`),placed=[];
   const frames=shapes.map(shape=>({...frame(shape,size*(.91+random()*.09)),order:random()}))
    .sort((a,b)=>b.width*b.height-a.width*a.height||a.order-b.order);
   for(const item of frames){
    if(item.width>width-margin*2||item.height>height-margin*2)continue;
    let winner=null,score=-Infinity;
    // Best-candidate sampling produces irregular, well-spread positions without
    // rings or grid slots. Collision checks include names, glows and a small gap.
    for(let n=0;n<420;n++){
     const x=margin+random()*(width-margin*2-item.width),y=margin+random()*(height-margin*2-item.height);
     const bounds={left:x-gap/2,top:y-gap/2,right:x+item.width+gap/2,bottom:y+item.height+gap/2};
     if(blocked.some(b=>overlap(bounds,b))||placed.some(b=>overlap(bounds,b.bounds)))continue;
     const cx=x+item.width/2,cy=y+item.height/2;
     const distance=placed.length?Math.min(...placed.map(b=>Math.hypot((cx-b.cx)/width,(cy-b.cy)/height))):.3;
     const centerDistance=Math.hypot((cx-width/2)/width,(cy-height/2)/height);
     const candidateScore=distance+.035*centerDistance+random()*.015;
     if(candidateScore>score){score=candidateScore;winner={...item,x,y,cx,cy,bounds};}
    }
    if(winner)placed.push(winner);
   }
   if(placed.length>best.length)best=placed;
   if(placed.length===shapes.length)return placed.map(emit).sort((a,b)=>ZODIAC_CONSTELLATIONS.findIndex(s=>s.id===a.id)-ZODIAC_CONSTELLATIONS.findIndex(s=>s.id===b.id));
  }
 }
 return best.map(emit);
}

const ringHours={Ari:0,Tau:1,Gem:2,Sco:3,Cnc:4,Leo:5,Vir:6,Sgr:7,Cap:8,Lib:9,Aqr:10,Psc:11};
/** Mobile uses four figures per horizontal row and two per side column. Each
 * group stays evenly spaced; the groups can move independently around controls. */
export function createConstellationMobileLayout({width,height,exclusions=[],centerY=height/2}={}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isFinite(centerY))return [];
 const blocked=exclusions.map(rect).filter(Boolean),gap=3,margin=8;
 const groups=[['top',['Psc','Ari','Tau','Gem']],['bottom',['Cap','Sgr','Vir','Leo']],['sides',['Aqr','Lib','Sco','Cnc']]];
 const centerFirst=(values,target)=>values.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
 const range=(a,b,step)=>Array.from({length:Math.max(0,Math.floor((b-a)/step)+1)},(_,i)=>a+i*step);
 let best=[];
 const attempts=[Math.min(48,width*.115),38,32,28].map(size=>({size,tight:false}));
 // Short phones have less than 50px between the heading and the Earth. Keep
 // the normal figures first, then recover space from frame padding/label gaps.
 // Only the final fallback reduces the stars further for an expanded heading.
 if(height<500)attempts.push(...[28,24,20,16,12].map(size=>({size,tight:true})));
 for(const {size,tight} of attempts){
  const frames=new Map(shapes.map(shape=>{
   const f=frame(shape,size,true);
   if(tight){f.padding=1;f.labelGap=1;f.labelHeight=10;f.width=Math.max(f.starWidth,f.labelWidth)+2;f.height=f.starHeight+13;}
   return [shape.sign.id,f];
  }));
  const candidates=groups.map(([row,ids])=>{
   const figures=ids.map(id=>frames.get(id)),result=[];
   function add(points){
    const items=figures.map((f,i)=>({...f,x:points[i].x-f.width/2,y:points[i].y-f.height/2,
     layoutRow:row==='sides'?(i<2?'left':'right'):row}));
    for(const item of items){
     item.bounds={left:item.x-gap/2,top:item.y-gap/2,right:item.x+item.width+gap/2,bottom:item.y+item.height+gap/2};
     if(item.x<margin||item.y<margin||item.x+item.width>width-margin||item.y+item.height>height-margin||blocked.some(b=>overlap(item.bounds,b)))return;
    }
    if(items.some((item,i)=>items.slice(i+1).some(b=>overlap(item.bounds,b.bounds))))return;
    result.push(items);
   }
   if(row==='top'||row==='bottom'){
    const top=row==='top',minY=top?32:centerY+45,maxY=top?centerY-55:height-25;
    // Include exact obstacle edges: a valid short-screen row can occupy a
    // sub-5px interval which the regular candidate scan would otherwise miss.
    const edgeYs=tight?blocked.flatMap(b=>figures.flatMap(f=>[b.bottom+f.height/2+gap/2+.01,b.top-f.height/2-gap/2-.01])):[];
    const ys=centerFirst([...new Set([...range(minY,maxY,5),...edgeYs.filter(y=>y>=minY&&y<=maxY)])],top?centerY*.34:centerY+(height-centerY)*.52);
    for(const y of ys)for(const step of [width*.225,width*.21,width*.24,width*.195])add(figures.map((_,i)=>({x:width/2+(i-1.5)*step,y})));
   }else{
    const xs=centerFirst(range(22,width*.32,3),width*.13);
    const ys=centerFirst(range(centerY-55,centerY+90,5),centerY+10);
    for(const x of xs)for(const y of ys)for(const separation of [110,90,130,70,150])add([
     {x,y:y-separation/2},{x,y:y+separation/2},
     {x:width-x,y:y-separation/2},{x:width-x,y:y+separation/2}]);
   }
   return result.slice(0,160);
  });
  // Most-constrained group first; bounded group search, not per-star animation.
  const ordered=candidates.map((c,i)=>({c,i})).sort((a,b)=>a.c.length-b.c.length),placed=[];
  let visited=0;
  function place(index){
   if(placed.length>best.length)best=[...placed];
   if(index===ordered.length)return true;
   if(++visited>700)return false;
   for(const group of ordered[index].c){
    if(group.some(item=>placed.some(other=>overlap(item.bounds,other.bounds))))continue;
    placed.push(...group);if(place(index+1))return true;placed.splice(placed.length-group.length);
   }
   return false;
  }
  if(place(0))return placed.map(item=>({...emit(item),layoutRow:item.layoutRow}));
 }
 return best.map(item=>({...emit(item),layoutRow:item.layoutRow}));
}
/** Desktop figures occupy twelve fixed clock positions on one true circle.
 * A short viewport shrinks every figure together; individual radii and angles
 * never change. Mobile retains its separate symmetric 4/4/2/2 arrangement. */
export function createConstellationRingLayout({width,height,exclusions=[],centerY=height/2}={}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isFinite(centerY))return [];
 if(width<600)return createConstellationMobileLayout({width,height,exclusions,centerY});
 const margin=8,gap=5,centerX=width/2,blocked=exclusions.map(rect).filter(Boolean);
 const initialSize=Math.min(120,Math.max(72,Math.min(centerY,height-centerY)*.34));
 const sizes=[initialSize,initialSize*.88,initialSize*.76,initialSize*.64,48,36].map(n=>Math.max(36,n));
 let best=[];
 for(const size of [...new Set(sizes)]){
  const frames=shapes.map(shape=>frame(shape,size)).sort((a,b)=>ringHours[a.shape.sign.id]-ringHours[b.shape.sign.id]);
  const maxRadius=Math.min(...frames.flatMap(f=>{
   const angle=ringHours[f.shape.sign.id]*Math.PI/6,s=Math.sin(angle),c=Math.cos(angle);
   return [Math.abs(s)<.01?Infinity:(width/2-margin-f.width/2)/Math.abs(s),
    Math.abs(c)<.01?Infinity:((c>0?centerY:height-centerY)-margin-f.height/2)/Math.abs(c)];
  }));
  if(maxRadius<=0)continue;
  // Shared radii only; finite scalar search avoids layout backtracking.
  for(let radius=maxRadius;radius>=maxRadius*.62;radius-=2){
   const placed=[];
   for(const item of frames){
    const id=item.shape.sign.id,angle=ringHours[id]*Math.PI/6;
    const cx=centerX+Math.sin(angle)*radius,cy=['Lib','Sco'].includes(id)?centerY:centerY-Math.cos(angle)*radius;
    const x=cx-item.width/2,y=cy-item.height/2;
    const bounds={left:x-gap/2,top:y-gap/2,right:x+item.width+gap/2,bottom:y+item.height+gap/2};
    if(x<margin||y<margin||x+item.width>width-margin||y+item.height>height-margin
      ||blocked.some(b=>overlap(bounds,b))||placed.some(b=>overlap(bounds,b.bounds)))continue;
    placed.push({...item,x,y,bounds});
   }
   if(placed.length>best.length)best=placed;
   if(placed.length===12)return placed.map(emit);
  }
 }
 return best.map(emit);
}
