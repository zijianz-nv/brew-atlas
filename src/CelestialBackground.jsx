import React, {memo,useMemo,useEffect,useRef,useState} from 'react';
import './celestial-background.css';
import SolarSystemPlanets from './SolarSystemPlanets.jsx';
import MeteorTrails from './MeteorTrails.jsx';
import {createConstellationRingLayout} from './constellation-layout.mjs';
import {createCelestialOrbits,orbitalFigureStyle,minimumSkyScale} from './celestial-orbits.mjs';
import {constellationInteriorBounds,placeCelestialBodies} from './celestial-body-placement.mjs';

const STARS=Array.from({length:64},(_,i)=>({x:(i*137+37)%1600,y:(i*233+71)%1000,r:i%11===0?1.6:.6+(i%3)*.25,opacity:.16+(i%5)*.08}));

function CelestialBackground({width=1440,height=670,earthRadius=330}){
  const backgroundRef=useRef(null),[skyEnabled,setSkyEnabled]=useState(false);
  const [titleBottom,setTitleBottom]=useState(58);
  useEffect(()=>{
    const background=backgroundRef.current;
    const summary=background?.closest('.main-content')?.querySelector('.map-summary');
    if(!background||!summary)return;
    const measure=()=>{
      const bottom=Math.max(0,summary.getBoundingClientRect().bottom-background.getBoundingClientRect().top);
      setTitleBottom(previous=>Math.abs(previous-bottom)<.5?previous:bottom);
    };
    const observer=new ResizeObserver(measure);observer.observe(summary);observer.observe(background);measure();
    return()=>observer.disconnect();
  },[width,height]);
  useEffect(()=>{
    const wrapper=backgroundRef.current?.closest('.brew-globe-view');if(!wrapper)return;
    const reveal=()=>{if(wrapper.dataset.skyExpanded==='true'){setSkyEnabled(true);observer.disconnect();}};
    const observer=new MutationObserver(reveal);observer.observe(wrapper,{attributes:true,attributeFilter:['data-sky-expanded']});reveal();return()=>observer.disconnect();
  },[]);
  const layout=useMemo(()=>createCelestialOrbits(width,height),[width,height]);
  const compact=width<600;
  const skyHeight=height+90;
  const exclusions=useMemo(()=>{
    const scale=minimumSkyScale(width),r=earthRadius*scale+8;
    return [{x:width/2-r,y:height/2-r,width:r*2,height:r*2+18},
      {x:0,y:0,width:compact?width:365,height:compact?Math.max(58,titleBottom+12):140},
      (compact?{x:width-260,y:height-14,width:236,height:44}:{x:width-80,y:height*.3,width:80,height:320}),
      {x:width/2-155,y:skyHeight-58,width:310,height:58},
      ...(compact?[{x:0,y:0,width:24,height:skyHeight},{x:width-24,y:0,width:24,height:skyHeight}]:[])];
  },[width,height,earthRadius,compact,skyHeight,titleBottom]);
  const sky=useMemo(()=>skyEnabled?createConstellationRingLayout({width,height:skyHeight,centerY:height/2,exclusions}):[],[width,height,skyHeight,exclusions,skyEnabled]);
  // Place the constellations first. Move planets into the remaining spaces;
  // planet positions must never distort the circle or the mobile symmetry.
  const bodyLayout=useMemo(()=>{
    if(!sky.length)return layout;
    const scale=minimumSkyScale(width),bodyWidths=compact?{SUN:160,MOON:33,MARS:26,MERCURY:32,VENUS:46,JUPITER:72,SATURN:110,URANUS:48,NEPTUNE:47}
      :{SUN:Math.min(360,Math.max(210,width*.25)),MOON:76,MARS:48,MERCURY:42,VENUS:68,JUPITER:118,SATURN:190,URANUS:70,NEPTUNE:72};
    const bodies=Object.entries(layout.points).filter(([name])=>name!=='EARTH').map(([name,p])=>({name,
      x:width/2+(p.x-width/2)*scale,y:height/2+(p.y-height/2)*scale,
      width:bodyWidths[name]*scale*p.depth,
      height:bodyWidths[name]*scale*p.depth*(name==='SATURN'?.6875:1)+(name==='SUN'?0:8)}));
    const bounds=constellationInteriorBounds({constellations:sky,width,centerY:height/2,gap:compact?5:10});
    const place=bodies=>placeCelestialBodies({width,height:skyHeight,bodies,bounds,
      exclusions:[...exclusions,...sky.map(s=>({x:s.x,y:s.y,width:s.width,height:s.height}))],gap:compact?5:10,padding:compact?24:12});
    let placements=bounds?place(bodies)
      :bodies.map(body=>({...body,placed:false}));
    // A short phone can fit the Sun's disc but not its large corona. Reduce
    // only that overview figure before giving up any of the nine bodies.
    if(bounds&&compact&&placements.some(body=>!body.placed))for(const sizeScale of [.85,.7,.55]){
      const candidate=place(bodies.map(body=>body.name==='SUN'?{...body,width:body.width*sizeScale,height:body.height*sizeScale,sizeScale}:body));
      if(candidate.filter(body=>body.placed).length>placements.filter(body=>body.placed).length)placements=candidate;
      if(placements.every(body=>body.placed))break;
    }
    const points={...layout.points};
    for(const p of placements){
      points[p.name]={...points[p.name],placed:p.placed,depth:points[p.name].depth*(p.sizeScale??1),...(p.placed?{
        x:width/2+(p.x-width/2)/scale,y:height/2+(p.y-height/2)/scale}: {})};
    }
    return {...layout,points};
  },[layout,width,height,compact,skyHeight,exclusions,sky]);
  const mainBodyStyle=name=>orbitalFigureStyle(bodyLayout,name,{
    SUN:{x:width*(compact?.12:.15),y:height*(compact?.34:.43)},
    MOON:{x:width*(compact?.1:.225),y:height*(compact?.1:.065)},
    MARS:{x:width*(compact?.84:.895),y:height*(compact?.065:.15)}
  }[name]);
  return <div ref={backgroundRef} className="celestial-background" style={{'--celestial-center-y':`${height/2}px`,'--celestial-title-bottom':`${titleBottom+12}px`}} aria-label="Sun, Moon and Mars. Zoom out to reveal the full Solar System, then twelve zodiac constellations. Libra and Scorpius have brighter stars.">
    <svg className="celestial-stars" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">{STARS.map((star,i)=><circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#cfdfdf" opacity={star.opacity}/>)}</svg>
    <MeteorTrails/>
    <div className="celestial-system">
    <figure className="celestial-body celestial-moon" style={mainBodyStyle('MOON')}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><radialGradient id="moon-light" cx="29%" cy="27%" r="76%"><stop stopColor="#e0ddcb"/><stop offset=".48" stopColor="#a5b0ad"/><stop offset=".8" stopColor="#4d636a"/><stop offset="1" stopColor="#122a35"/></radialGradient><clipPath id="moon-disc"><circle cx="50" cy="50" r="43"/></clipPath></defs>
        <circle cx="50" cy="50" r="43" fill="url(#moon-light)"/>
        <g clipPath="url(#moon-disc)" fill="#3e555e" opacity=".26"><path d="M22 21q20-13 27 0t-7 21q-14 1-20-10zM49 37q19-17 28-6t-3 19q-1 10-12 8t-13-21zM21 51q10-13 23-1t-3 20q-20 5-20-19z"/>{[[36,17,4],[20,42,5],[52,67,8],[36,76,4],[73,64,5],[46,44,3],[63,19,4],[19,64,3]].map(([x,y,r],i)=><g key={i}><circle cx={x} cy={y} r={r} fill="none" stroke="#d5dace" strokeWidth="1.3"/><circle cx={x-1} cy={y+1} r={r-1}/></g>)}</g>
        <circle cx="50" cy="50" r="43" fill="none" stroke="#d9e6df" strokeOpacity=".15"/>
      </svg><figcaption>MOON</figcaption>
    </figure>
    <figure className="celestial-body celestial-mars" style={mainBodyStyle('MARS')}>
      <svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="mars-light" cx="28%" cy="26%" r="78%"><stop stopColor="#d0a17e"/><stop offset=".4" stopColor="#ab7354"/><stop offset=".73" stopColor="#6f483b"/><stop offset="1" stopColor="#17252b"/></radialGradient><clipPath id="mars-disc"><circle cx="50" cy="50" r="43"/></clipPath></defs><circle cx="50" cy="50" r="43" fill="url(#mars-light)"/><g clipPath="url(#mars-disc)"><path d="M10 46q26-13 37 1t36 0l12 16q-31-11-47 0T4 62zM32 27q10-16 19-4t-11 14z" fill="#543c35" opacity=".26"/><path d="M33 8q17-7 32 2l-4 8-13-3-11 2z" fill="#e5d9c7" opacity=".57"/><path d="M22 38l34 7 17-5" fill="none" stroke="#cd9876" strokeWidth="2" opacity=".32"/></g></svg><figcaption>MARS</figcaption>
    </figure>
    <figure className="celestial-body celestial-sun" style={mainBodyStyle('SUN')}>
      <svg viewBox="0 0 160 160" aria-hidden="true"><defs>
        <radialGradient id="sun-corona"><stop stopColor="#fff3d1" stopOpacity=".45"/><stop offset=".25" stopColor="#fac96e" stopOpacity=".25"/><stop offset=".52" stopColor="#e99538" stopOpacity=".09"/><stop offset="1" stopColor="#d58a45" stopOpacity="0"/></radialGradient>
        <radialGradient id="sun-disc"><stop stopColor="#fffbea"/><stop offset=".55" stopColor="#ffe6a6"/><stop offset=".80" stopColor="#f8bc61"/><stop offset=".94" stopColor="#f1a145" stopOpacity=".8"/><stop offset="1" stopColor="#eaa04e" stopOpacity="0"/></radialGradient>
      </defs><circle cx="80" cy="80" r="80" fill="url(#sun-corona)"/><circle cx="80" cy="80" r="30" fill="url(#sun-disc)"/></svg><figcaption>SUN</figcaption>
    </figure>
    <div className="celestial-outer-planets"><SolarSystemPlanets layout={bodyLayout}/><span className="celestial-earth-label">EARTH</span></div>
    </div>
    <div className="celestial-zodiac" aria-label="Decorative constellation sky" style={{height:skyHeight,transformOrigin:`50% ${height/2}px`}}>
      <svg className="celestial-sky-atlas" viewBox={`0 0 ${width} ${skyHeight}`} aria-hidden="true">
        <g>
        {sky.map(sign=><g key={sign.id} className={`celestial-constellation ${sign.starEmphasis?'celestial-bright-stars':''}`} data-sign={sign.name.toUpperCase()} data-layout-row={sign.layoutRow} data-box={[sign.x,sign.y,sign.width,sign.height].join(",")}>
          <g className="constellation-art"><g fill="none" stroke="#b9cbd1" strokeWidth=".7" strokeOpacity=".36">{sign.segments.map((segment,i)=><polyline key={i} points={`${segment.x1},${segment.y1} ${segment.x2},${segment.y2}`}/>)}</g>
          {sign.stars.map(star=>{const r=Math.max(.7,1.9-star.magnitude*.20);return <g key={star.id} fill={star.name==='Antares'?'#edb080':'#dfebe8'}><circle cx={star.x} cy={star.y} r={r*3.1} opacity=".06"/><circle cx={star.x} cy={star.y} r={r*1.8} opacity=".12"/><circle cx={star.x} cy={star.y} r={r}/></g>})}</g>
          <text x={sign.label.x} y={sign.label.y} textAnchor="middle" className="constellation-name">{compact?sign.id.toUpperCase():sign.name.toUpperCase()}</text>
        </g>)}
        </g>
      </svg>
    </div>
  </div>;
}

export default memo(CelestialBackground);
