import React, {useEffect,useState} from 'react';
import './year-filter.css';
export default function YearFilter({value,onChange,years=[],knownCount=0,beers=[],onBeerSelect}){
 const [shown,setShown]=useState(8);useEffect(()=>setShown(8),[value]);
 const options=[...new Set(years)].sort((a,b)=>b-a);
 return <section className="year-filter" aria-label="酒款诞生年份筛选">
  <label className="year-select"><span>诞生年份</span><select aria-label="选择诞生年份" value={value??'all'} onChange={e=>onChange(e.target.value==='all'?null:e.target.value==='unknown'?'unknown':Number(e.target.value))}><option value="all">全部年份</option>{options.map(year=><option key={year} value={year}>{year} 年</option>)}<option value="unknown">年份未查到</option></select></label>
  <div className="year-filter-heading"><small>当前资料中 {knownCount.toLocaleString()} 款有年份依据</small>{value!=null&&<button onClick={()=>onChange(null)} aria-label="清除年份筛选">清除</button>}</div>
  {value!=null&&<div className="year-results" aria-label="所选年份的酒款">{beers.slice(0,shown).map(beer=><button key={beer.id} className="year-beer-result" onClick={()=>onBeerSelect?.(beer)} aria-label={`查看年份酒款：${beer.name}`}>{beer.imageThumbnail?<img src={beer.imageThumbnail} alt="" loading="lazy" decoding="async"/>:<span className="year-no-image">待补图</span>}<span><strong>{beer.name}</strong><small>{beer.styleZh||beer.style||'风格待补充'}{Number.isFinite(beer.abv)?` · ${beer.abv}% ABV`:''}</small></span><span aria-hidden="true">↗</span></button>)}{!beers.length&&<p className="facet-note">当前筛选下暂无该年份酒款。</p>}{beers.length>shown&&<button className="year-more" onClick={()=>setShown(n=>n+8)}>显示更多酒款（{beers.length-shown}）</button>}</div>}
  <p className="facet-note">首次推出或酿造的年份；历史配方单独标注。</p>
 </section>;
}
