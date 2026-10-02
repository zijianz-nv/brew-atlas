import React, {useEffect, useRef, useState} from 'react';
import {Megaphone, X} from 'lucide-react';
import updates from './announcements.json';

const SEEN_KEY='brew-atlas-announcement-seen';
const readSeen=()=>{try{return localStorage.getItem(SEEN_KEY);}catch{return null;}};

export default function Announcements() {
  const [open,setOpen]=useState(false),[seen,setSeen]=useState(readSeen);
  const wrapper=useRef(null),trigger=useRef(null),closeButton=useRef(null);
  const latest=updates[0]?.id,unread=Boolean(latest&&seen!==latest);
  const close=()=>{setOpen(false);trigger.current?.focus();};
  const toggle=()=>{
    if(open){setOpen(false);return;}
    setOpen(true);setSeen(latest);
    try{localStorage.setItem(SEEN_KEY,latest);}catch{}
  };
  useEffect(()=>{
    if(!open)return;
    closeButton.current?.focus();
    const outside=event=>{if(!wrapper.current?.contains(event.target))setOpen(false);};
    const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}};
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div ref={wrapper} className="announcements">
    <button ref={trigger} className="announcement-trigger" aria-label="公告栏" title="公告栏" aria-expanded={open} aria-controls="announcement-panel" aria-haspopup="dialog" onClick={toggle}>
      <Megaphone size={17}/><span>公告</span>{unread&&<i className="announcement-unread" aria-label="有新公告"/>}
    </button>
    {open&&<section id="announcement-panel" className="announcement-panel" role="dialog" aria-labelledby="announcement-title">
      <header><div><small>BREW ATLAS</small><h2 id="announcement-title">公告栏</h2></div><button ref={closeButton} className="icon-button" aria-label="关闭公告栏" onClick={close}><X size={18}/></button></header>
      <div className="announcement-list">{updates.map((update,index)=><article key={update.id}>
        <div className="announcement-date"><time dateTime={update.date}>{update.date.replaceAll('-','.')}</time>{index===0&&<span>最新</span>}</div>
        <h3>{update.title}</h3>
        <dl className="announcement-features">{update.features.map(feature=><div key={feature.name}><dt>{feature.name}</dt><dd>{feature.text}</dd></div>)}</dl>
      </article>)}</div>
    </section>}
  </div>;
}
