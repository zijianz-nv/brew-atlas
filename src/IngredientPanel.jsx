import React from 'react';
import {Sprout, ExternalLink, X} from 'lucide-react';
import {INGREDIENT_TYPES, INGREDIENT_REGIONS} from './ingredient-regions.mjs';
import {APP_BASE_URL,withBasePath} from './base-path.mjs';
import './ingredients.css';

export default function IngredientPanel({region,onSelect,onLocate,onClose,recommendations=[],onBeerSelect}) {
  if(!region)return null;
  const type=INGREDIENT_TYPES.find(item=>item.id===region.type);
  return <aside className="ingredient-panel" aria-label="酿酒原料产区" data-region-id={region.id}>
    <header><span className="ingredient-emblem"><img src={withBasePath(`/images/ingredients/${region.type}.png`,APP_BASE_URL)} alt=""/></span><div><small>原料种植产区</small><h2>{type?.labelZh||region.type}</h2></div><button className="icon-button" aria-label="关闭原料产区" onClick={onClose}><X size={18}/></button></header>
    <label className="ingredient-region-picker"><span>探索产区</span><select value={region.id} onChange={event=>{const next=INGREDIENT_REGIONS.find(item=>item.id===event.target.value);if(next){onSelect(next);onLocate(next);}}}>{INGREDIENT_TYPES.map(type=><optgroup key={type.id} label={type.labelZh}>{INGREDIENT_REGIONS.filter(item=>item.type===type.id).map(item=><option key={item.id} value={item.id}>{item.nameZh}</option>)}</optgroup>)}</select></label>
    <h3>{region.nameZh}</h3><button className="ingredient-locate" onClick={()=>onLocate(region)}>定位这个产区 ↗</button><p>{region.description}</p>
    <section className="ingredient-beer-list" aria-label="产区相关酒款"><h4>从这里认识一杯</h4>
      {recommendations.map(({beer,brewery,scope,summary})=><button key={beer.id} className="ingredient-beer-card" onClick={()=>onBeerSelect?.(beer)} aria-label={`查看酒款：${beer.name}`}>
        <img loading="lazy" decoding="async" src={withBasePath(beer.imageThumbnail||beer.image,APP_BASE_URL)} alt=""/>
        <span className="ingredient-beer-copy"><small>{scope==='nearby'?'产区周边':scope==='country'?`${brewery.countryZh||region.countryZh}酒款`:'同原料酒款'} · {brewery.cityZh||brewery.city||brewery.countryZh||brewery.country}</small>
          <strong>{beer.name}</strong><span>{beer.styleZh||beer.style}{Number.isFinite(beer.abv)?` · ${beer.abv}% ABV`:''}</span><p>{summary}</p></span>
      </button>)}
      {!recommendations.length&&<p>正在查找有图片和可靠介绍的相关酒款。</p>}
      {recommendations.some(item=>item.scope==='ingredient')&&<p className="ingredient-recommendation-note">含同原料的异地产酒款，产地见酒款资料。</p>}
    </section>
    {region.seasonSummary&&<section className="ingredient-climate"><h4><Sprout size={16}/>生长与采收季节</h4><p>{region.seasonSummary}</p></section>}
    <section className="ingredient-climate"><h4>适宜的气候</h4><p>{region.climateSummary}</p></section>
    <p className="ingredient-boundary-note">代表产区的示意位置，不代表附近酒厂的采购来源。季节因品种、海拔和年份有所变化。</p>
    <footer>{[...new Set([...(region.sourceUrls||[]),...(region.seasonSourceUrls||[]),...(region.climateSourceUrls||[])])].slice(0,4).map((url,index)=><a href={url} key={url} target="_blank" rel="noreferrer">{index===0?'产区资料':'农业参考'} <ExternalLink size={10}/></a>)}</footer>
  </aside>;
}
