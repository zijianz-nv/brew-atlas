import React, {memo, useId} from 'react';
import {orbitalFigureStyle} from './celestial-orbits.mjs';

// Decorative, locally drawn planets. Earth remains the interactive globe.
// Layout and visibility belong to the containing celestial-system layer.
function Planet({name, colors, children,layout}) {
  const id = `planet-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <figure className={`celestial-body celestial-${name.toLowerCase()}`} style={orbitalFigureStyle(layout,name)}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-light`} cx="29%" cy="25%" r="79%">
          <stop stopColor={colors[0]}/><stop offset=".43" stopColor={colors[1]}/>
          <stop offset=".77" stopColor={colors[2]}/><stop offset="1" stopColor="#132831"/>
        </radialGradient>
        <clipPath id={`${id}-disc`}><circle cx="50" cy="50" r="43"/></clipPath>
        <radialGradient id={`${id}-shade`} cx="28%" cy="24%" r="82%">
          <stop offset=".36" stopColor="#0c202b" stopOpacity="0"/>
          <stop offset=".76" stopColor="#0c202b" stopOpacity=".12"/>
          <stop offset="1" stopColor="#0c202b" stopOpacity=".66"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="43" fill={`url(#${id}-light)`}/>
      <g clipPath={`url(#${id}-disc)`}>{children}</g>
      <circle cx="50" cy="50" r="43" fill={`url(#${id}-shade)`}/>
      <circle cx="50" cy="50" r="43" fill="none" stroke={colors[0]} strokeWidth=".65" strokeOpacity=".18"/>
    </svg>
    <figcaption>{name}</figcaption>
  </figure>;
}

function Saturn({layout}) {
  const id = `saturn-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return <figure className="celestial-body celestial-saturn" style={orbitalFigureStyle(layout,'SATURN')}>
    <svg viewBox="0 0 160 110" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-light`} cx="30%" cy="24%" r="80%">
          <stop stopColor="#e1d7b2"/><stop offset=".48" stopColor="#bdb18b"/>
          <stop offset=".8" stopColor="#817962"/><stop offset="1" stopColor="#243238"/>
        </radialGradient>
        <clipPath id={`${id}-disc`}><circle cx="80" cy="53" r="32"/></clipPath>
      </defs>
      <g transform="rotate(-22 80 53)" fill="none">
        <ellipse cx="80" cy="53" rx="65" ry="17" stroke="#a99d78" strokeWidth="8" opacity=".55"/>
        <ellipse cx="80" cy="53" rx="54" ry="13" stroke="#c8bc94" strokeWidth="5" opacity=".65"/>
        <ellipse cx="80" cy="53" rx="70" ry="20" stroke="#c6b997" strokeWidth="1.2" opacity=".36"/>
      </g>
      <circle cx="80" cy="53" r="32" fill={`url(#${id}-light)`}/>
      <g clipPath={`url(#${id}-disc)`} fill="none" strokeLinecap="round">
        <path d="M41 39q36 8 79 0M44 63q33 7 75-1" stroke="#887b5a" strokeWidth="5" opacity=".18"/>
        <path d="M44 48q34 6 77 0M49 71q34 6 66-1" stroke="#e5dab3" strokeWidth="2" opacity=".17"/>
      </g>
      <g transform="rotate(-22 80 53)" fill="none">
        <path d="M15 53a65 17 0 0 0 130 0" stroke="#bbae86" strokeWidth="8" opacity=".88"/>
        <path d="M26 53a54 13 0 0 0 108 0" stroke="#d6c7a0" strokeWidth="5" opacity=".83"/>
        <path d="M10 53a70 20 0 0 0 140 0" stroke="#ddd0ad" strokeWidth="1.2" opacity=".45"/>
      </g>
    </svg>
    <figcaption>SATURN</figcaption>
  </figure>;
}

function SolarSystemPlanets({layout}) {
  return <>
    <Planet layout={layout} name="MERCURY" colors={['#cec8b9', '#98958a', '#5b6564']}>
      <path d="M15 31q20-14 28 0t-9 18q-19-2-19-18M57 52q18-10 27 5t-14 17q-16-5-13-22" fill="#4f5b5c" opacity=".19"/>
      {[[27,26,5],[57,19,3],[47,47,8],[22,60,5],[64,68,6],[42,79,3],[77,39,4]].map(([x,y,r],i)=><g key={i}>
        <circle cx={x} cy={y} r={r} fill="#485454" opacity=".26"/>
        <path d={`M${x-r} ${y}a${r} ${r} 0 0 1 ${2*r} 0`} fill="none" stroke="#e0d8c1" strokeWidth="1" opacity=".35"/>
      </g>)}
    </Planet>
    <Planet layout={layout} name="VENUS" colors={['#e4d4ad', '#c6ac81', '#88795b']}>
      <g fill="none" strokeLinecap="round">
        <path d="M-2 30q32 23 61-1t52 10M-9 61q34-19 61 1t57 1" stroke="#ece0be" strokeWidth="9" opacity=".28"/>
        <path d="M0 45q34 15 61-4t41 9M4 77q29-8 53 3t35-1" stroke="#77684c" strokeWidth="4" opacity=".18"/>
        <path d="M16 18q20 15 42 1M29 51q13-7 31-2" stroke="#f0e2c3" strokeWidth="2" opacity=".35"/>
      </g>
    </Planet>
    <Planet layout={layout} name="JUPITER" colors={['#e3d9bd', '#bfad8d', '#837461']}>
      <g fill="none">
        <path d="M0 22q42 11 100 1M-4 45q46 8 110 0M0 72q48 10 103-1" stroke="#997456" strokeWidth="9" opacity=".59"/>
        <path d="M0 34q45 9 105-1M-2 60q48 8 108-1M8 83q38 7 90-2" stroke="#e2d5b8" strokeWidth="5" opacity=".56"/>
        <path d="M8 47q18-5 31 1t32-1M7 68q24-4 36 1t44-3" stroke="#725d49" strokeWidth="1.7" opacity=".28"/>
      </g>
      <ellipse cx="63" cy="65" rx="13" ry="7" fill="#a5795a" opacity=".83" transform="rotate(-8 63 65)"/>
      <ellipse cx="63" cy="65" rx="8" ry="3.4" fill="none" stroke="#ddba8c" strokeWidth="1.3" opacity=".65"/>
    </Planet>
    <Saturn layout={layout}/>
    <Planet layout={layout} name="URANUS" colors={['#c2ded9', '#8bbdbd', '#56838d']}>
      <g transform="rotate(72 50 50)" fill="none">
        <path d="M4 36q45 9 91 0M3 62q45 8 95-1" stroke="#d0e4d9" strokeWidth="6" opacity=".12"/>
        <path d="M5 49q42 8 90-1" stroke="#537f8b" strokeWidth="3" opacity=".1"/>
      </g>
      <ellipse cx="29" cy="24" rx="13" ry="8" fill="#e1ece3" opacity=".09"/>
    </Planet>
    <Planet layout={layout} name="NEPTUNE" colors={['#8dbacb', '#477b9c', '#2a526f']}>
      <g fill="none" strokeLinecap="round">
        <path d="M2 31q40 10 96-1M0 64q48 7 101-2" stroke="#94c6d3" strokeWidth="5" opacity=".21"/>
        <path d="M0 47q42 7 103-1M11 78q35 7 82-2" stroke="#234b70" strokeWidth="7" opacity=".27"/>
      </g>
      <ellipse cx="62" cy="57" rx="10" ry="5" fill="#204867" opacity=".53" transform="rotate(-9 62 57)"/>
      <path d="M51 53q12-4 23-1" fill="none" stroke="#c7dce0" strokeWidth="1.2" opacity=".42"/>
    </Planet>
  </>;
}

export default memo(SolarSystemPlanets);
