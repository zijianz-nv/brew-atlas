// A compact perspective illustration, not astronomical distances or live ephemerides.
const TILT=16*Math.PI/180,FLAT=.30;
export const SOLAR_ORBITS=[
 {name:'MERCURY',radius:1,angle:-130},{name:'VENUS',radius:1.8,angle:100},
 {name:'EARTH',radius:3,angle:50},{name:'MARS',radius:3.8,angle:38},
 {name:'JUPITER',radius:4.6,angle:-15},{name:'SATURN',radius:5.2,angle:-55},
 {name:'URANUS',radius:5.8,angle:-80},{name:'NEPTUNE',radius:6.2,angle:100}
];
// Stop at a legible overview; buttons, wheel and pinch share this camera bound.
export function minimumSkyScale(width){return width<600?.30:.22;}
export function maximumSkyAltitude(homeAltitude,width){return Math.sqrt(1+homeAltitude*(homeAltitude+2)/minimumSkyScale(width)**2)-1;}
function vector(radius,angle,unit){const t=angle*Math.PI/180,x=Math.cos(t)*radius*unit,y=Math.sin(t)*radius*unit*FLAT;return{x:x*Math.cos(TILT)-y*Math.sin(TILT),y:x*Math.sin(TILT)+y*Math.cos(TILT)}}
export function createCelestialOrbits(width,height){
 const unit=Math.min(width*(width<600?.50:.60),height*.8),earth=vector(3,50,unit),sun={x:width/2-earth.x,y:height/2-earth.y};
 const points={SUN:{...sun,depth:1},MOON:{x:width/2-.66*unit,y:height/2-.48*unit,depth:.88}};
 for(const orbit of SOLAR_ORBITS){const v=vector(orbit.radius,orbit.angle,unit);points[orbit.name]={x:sun.x+v.x,y:sun.y+v.y,depth:orbit.name==='EARTH'||orbit.name==='MARS'?1:({MERCURY:.56,VENUS:.62,JUPITER:.68,SATURN:.64,URANUS:.48,NEPTUNE:.46}[orbit.name])}}
 const path=(radius,start,end)=>Array.from({length:65},(_,i)=>{const p=vector(radius,start+(end-start)*i/64,unit);return`${i?'L':'M'}${(sun.x+p.x).toFixed(2)},${(sun.y+p.y).toFixed(2)}`}).join(' ');
 return{width,height,points,orbits:SOLAR_ORBITS.map(o=>({...o,back:path(o.radius,180,360),front:path(o.radius,0,180)}))};
}
export function orbitalFigureStyle(layout,name,base){const p=layout.points[name],b=base||p;return{'--planet-base-x':`${b.x}px`,'--planet-base-y':`${b.y}px`,'--planet-orbit-x':`${p.x}px`,'--planet-orbit-y':`${p.y}px`,'--planet-depth':p.depth,...(p.placed===false?{visibility:'hidden'}:{})}}
