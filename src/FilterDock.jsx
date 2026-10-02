import React, {useId, useRef, useState, useLayoutEffect} from 'react';
import {Search, X, Sparkles, RotateCw, Grid2X2, Droplets, Leaf, MapPin, SlidersHorizontal} from 'lucide-react';
import {STYLE_FAMILIES, FACETS} from './beer-taxonomy.mjs';
import {ABV_DOMAIN, ABV_SLIDER_STEPS, normalizeAbvRange, abvToSliderPosition, sliderPositionToAbv, formatAbv} from './abv-filter.mjs';
import './abv-filter.css';
import './country-selection.css';
import './filter-dock.css';
import YearFilter from './YearFilter.jsx';

export const COLLECTIONS = Object.freeze([{id:'all',label:'全部酒库'},{id:'awards',label:'Untappd 获奖'},{id:'representative',label:'全球代表'},{id:'pictured',label:'有图酒库'},{id:'regional',label:'地方酒款'},{id:'beertasting',label:'BeerTasting'},{id:'off',label:'Open Food Facts'},{id:'world',label:'世界酒款'},{id:'archive',label:'历史酒款 · 旧资料'},{id:'openbeer',label:'Open Beer'},{id:'local',label:'本地资料'}]);

const LABELS = {family:'种类',substyle:'子风格',taste:'口味',mouthfeel:'口感',aroma:'风味',process:'制作工艺',ingredient:'原料',brewery:'酒厂',country:'国家或地区',strength:'酒精度'};
const tabs = [{id:'family',label:'种类',Icon:Grid2X2,keys:['family','substyle']},{id:'taste',label:'口味与口感',Icon:Droplets,keys:['taste','mouthfeel']},{id:'aroma',label:'风味',Icon:Leaf,keys:['aroma']},{id:'place',label:'酒厂与地区',Icon:MapPin,keys:['country','brewery']},{id:'year',label:'年份',Icon:SlidersHorizontal,keys:[]},{id:'more',label:'更多',Icon:SlidersHorizontal,keys:['process','ingredient']}];
const formatter = new Intl.NumberFormat('zh-CN');

function SelectFacet({dimension,options,value,onChange,counts={},allLabel='全部',unknown=true}) {
  const items=[{id:'all',label:allLabel},...options.filter(option=>option.id!=='all'&&option.id!=='unknown'),...(unknown?[{id:'unknown',label:'未提供'}]:[])];
  return <label className="facet-select"><span>{LABELS[dimension]}</span><select aria-label={`按${LABELS[dimension]}筛选`} data-facet={dimension} value={value} onChange={event=>onChange(event.target.value)}>{items.map(({id,label})=><option key={id} value={id} disabled={id!=='all'&&id!==value&&!counts[id]}>{label} · {formatter.format(counts[id]||0)}</option>)}</select></label>;
}

function Chips({dimension,options,value,onChange,counts={},allLabel='不限',unknown=true}) {
  const items=[{id:'all',label:allLabel},...options.filter(option=>option.id!=='unknown'),...(unknown?[{id:'unknown',label:'未提供'}]:[])];
  return <div className={`facet-chips ${dimension==='family'?'family-chips':''}`} aria-label={`${LABELS[dimension]}选项`}>{items.map(({id,label})=><button key={id} data-facet={dimension} data-value={id} data-count={counts[id]||0} className={value===id?'active':''} aria-pressed={value===id} disabled={id!=='all'&&id!==value&&!counts[id]} onClick={()=>onChange(value===id?'all':id)}><span>{label}</span><small>{formatter.format(counts[id]||0)}</small></button>)}</div>;
}

function AbvRangeFilter({value,onChange,domain=ABV_DOMAIN}) {
  const noteId=useId(),trackRef=useRef(),dragRef=useRef(null);
  const [activeHandle,setActiveHandle]=useState('max');
  const range=normalizeAbvRange(value,domain)||{min:domain.min,max:domain.max};
  const rangeRef=useRef(range);rangeRef.current=range;
  const start=abvToSliderPosition(range.min,domain),end=abvToSliderPosition(range.max,domain);
  const update=(handle,next)=>{
    if(!Number.isFinite(next))return;
    const current=rangeRef.current;
    const normalized=normalizeAbvRange(handle==='min'?{min:Math.min(next,current.max),max:current.max}:{min:current.min,max:Math.max(next,current.min)},domain);
    rangeRef.current=normalized;onChange?.(normalized);
  };
  const pointerValue=event=>{const rect=trackRef.current.getBoundingClientRect();return sliderPositionToAbv((event.clientX-rect.left)/rect.width*ABV_SLIDER_STEPS,domain);};
  const beginDrag=event=>{
    if(event.target.tagName==='INPUT'||event.button!==0)return;
    const next=pointerValue(event),position=abvToSliderPosition(next,domain);
    const handle=Math.abs(position-start)<Math.abs(position-end)?'min':'max';
    dragRef.current=handle;setActiveHandle(handle);event.currentTarget.setPointerCapture(event.pointerId);update(handle,next);
  };
  const keyChange=(event,handle)=>{
    const current=rangeRef.current[handle];let next;
    if(['ArrowLeft','ArrowDown'].includes(event.key))next=current-domain.step;
    else if(['ArrowRight','ArrowUp'].includes(event.key))next=current+domain.step;
    else if(event.key==='PageDown')next=current-1;
    else if(event.key==='PageUp')next=current+1;
    else if(event.key==='Home')next=domain.min;
    else if(event.key==='End')next=domain.max;
    else return;
    event.preventDefault();update(handle,next);
  };
  return <section className="abv-filter" aria-label="酒精度范围筛选" data-abv-active={value!=null}>
    <div className="abv-filter-header"><strong>酒精度 <small>ABV</small></strong><output className="abv-filter-value">{value==null?'不限度数':`${formatAbv(range.min)} – ${formatAbv(range.max)}`}</output><span id={noteId} className="abv-filter-note">{value==null?'包含未提供度数':'不含未提供度数'}</span>{value!=null&&<button className="abv-filter-clear" aria-label="清除酒精度筛选" onClick={()=>onChange?.(null)}>清除</button>}</div>
    <div ref={trackRef} className="abv-range-track" style={{'--abv-start':`${start/10}%`,'--abv-end':`${end/10}%`}} onPointerDown={beginDrag} onPointerMove={event=>{if(dragRef.current)update(dragRef.current,pointerValue(event));}} onPointerUp={()=>{dragRef.current=null;}} onPointerCancel={()=>{dragRef.current=null;}}>
      <span className="abv-range-selected"/>
      {['min','max'].map(handle=><input key={handle} type="range" min="0" max={ABV_SLIDER_STEPS} step="1" value={handle==='min'?start:end} data-abv-handle={handle} aria-label={handle==='min'?'最低酒精度':'最高酒精度'} aria-describedby={noteId} aria-valuemin={handle==='min'?domain.min:range.min} aria-valuemax={handle==='min'?range.max:domain.max} aria-valuenow={range[handle]} aria-valuetext={`${formatAbv(range[handle])} ABV`} style={{zIndex:activeHandle===handle?3:2}} onFocus={()=>setActiveHandle(handle)} onPointerDown={()=>setActiveHandle(handle)} onChange={event=>update(handle,sliderPositionToAbv(Number(event.target.value),domain))} onKeyDown={event=>keyChange(event,handle)}/>)}
    </div>
    <div className="abv-filter-scale" aria-hidden="true"><span>{formatAbv(domain.min)}</span>{domain.max===100&&domain.min===0&&<span>10%</span>}<span>{formatAbv(domain.max)}</span></div>
  </section>;
}

export default function FilterDock({detailOpen=false,searchRef,query,setQuery,selections,onFacet,counts,substyles,countryOptions,breweryOptions,photosOnly,setPhotosOnly,mappedOnly,setMappedOnly,moreFilters,setMoreFilters,resetFilters,isFiltered,randomBeer,resultCount,selectedLaunchYear=null,onYearRangeChange,yearKnownCount=0,years,yearBeers=[],onYearBeerSelect,abvRange=null,onAbvRangeChange,abvDomain=ABV_DOMAIN,selectedCountryLabel=null,onClearCountry}) {
  const dockRef=useRef(null);
  const [overviewExpanded,setOverviewExpanded]=useState(false);
  useLayoutEffect(()=>{
    const dock=dockRef.current,app=dock?.closest('.app');
    if(!dock||!app)return;
    const measure=()=>app.style.setProperty('--dock-clearance',`${Math.ceil(app.getBoundingClientRect().bottom-dock.getBoundingClientRect().top+12)}px`);
    measure();const observer=new ResizeObserver(measure);observer.observe(dock);
    window.addEventListener('resize',measure);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);app.style.removeProperty('--dock-clearance');};
  },[]);
  const facetSelect=(dimension,options,extra={})=><SelectFacet dimension={dimension} options={options} value={selections[dimension]} onChange={id=>onFacet(dimension,id)} counts={counts[dimension]} {...extra}/>;
  const facetChips=(dimension,options,extra={})=><Chips dimension={dimension} options={options} value={selections[dimension]} onChange={id=>onFacet(dimension,id)} counts={counts[dimension]} {...extra}/>;
  return <section ref={dockRef} className="filter-dock taxonomy-dock" data-detail-open={detailOpen} data-overview-expanded={overviewExpanded} aria-label="底部筛选">
    <div className="dock-main"><div className="search-box"><Search size={16}/>{selectedCountryLabel&&<button className="search-country-chip" aria-label={`清除国家筛选：${selectedCountryLabel}`} title={`清除国家筛选：${selectedCountryLabel}`} onClick={onClearCountry}><span>{selectedCountryLabel}</span><X size={12}/></button>}<input ref={searchRef} aria-label="搜索酒款酒厂或国家" placeholder={selectedCountryLabel?`在${selectedCountryLabel}搜索酒款或酒厂`:'搜索酒名、酒厂、城市或国家'} value={query} onChange={event=>setQuery(event.target.value)}/>{query?<button aria-label="清空搜索" onClick={()=>setQuery('')}><X size={14}/></button>:<kbd>/</kbd>}</div>
      <div className="dock-actions"><button className="sky-filter-toggle" aria-label="展开或收起星空筛选" aria-expanded={overviewExpanded} onClick={()=>setOverviewExpanded(value=>!value)}><SlidersHorizontal size={15}/><span>{overviewExpanded?'收起':'筛选'}</span></button><button className="reset-filter dock-reset" aria-label="清除全部筛选" title="重置筛选" disabled={!isFiltered} onClick={resetFilters}><RotateCw size={15}/><span>重置</span></button>
      <button className="random-button" onClick={randomBeer} disabled={!resultCount} aria-label="随机遇见一杯"><Sparkles size={15}/><span>随机一杯</span></button></div>
    </div>
    <nav className="facet-tabs" aria-label="分类筛选维度">{tabs.map(({id,label,Icon,keys})=>{const selected=keys.filter(key=>selections[key]&&selections[key]!=='all').length+(id==='more'?Number(photosOnly)+Number(mappedOnly):0)+(id==='year'?Number(selectedLaunchYear!=null):0);return <button key={id} className={(moreFilters||'family')===id?'active':''} aria-label={id==='more'?'更多筛选':label} aria-expanded={moreFilters===id} onClick={()=>setMoreFilters(moreFilters===id?false:id)}><Icon size={13}/><span>{label}</span>{selected>0&&<b>{selected}</b>}</button>;})}</nav>
    {facetChips('family',STYLE_FAMILIES,{allLabel:'全部种类'})}
    <AbvRangeFilter value={abvRange} onChange={onAbvRangeChange} domain={abvDomain}/>
    {moreFilters&&<section className="facet-panel" aria-label="详细筛选"><header><strong>{tabs.find(tab=>tab.id===moreFilters)?.label}</strong><span>{formatter.format(resultCount)} 条匹配</span><button aria-label="收起筛选" className="icon-button" onClick={()=>setMoreFilters(false)}><X size={16}/></button></header>
      <div className="facet-panel-body">
        {moreFilters==='year'&&<YearFilter value={selectedLaunchYear} onChange={onYearRangeChange} knownCount={yearKnownCount} years={years} beers={yearBeers} onBeerSelect={onYearBeerSelect}/>}
        {moreFilters==='family'&&<>{facetSelect('family',STYLE_FAMILIES,{allLabel:'全部种类'})}{facetSelect('substyle',substyles,{allLabel:'全部子风格'})}<p className="facet-note">先选大类，再找具体风格。</p></>}
        {moreFilters==='taste'&&<><div className="facet-section"><h3>口味</h3>{facetChips('taste',FACETS.taste)}</div><div className="facet-section"><h3>口感</h3>{facetChips('mouthfeel',FACETS.mouthfeel)}</div><p className="facet-note">口味与口感来自酒款资料；IBU 不等同于喝起来的苦感。</p></>}
        {moreFilters==='aroma'&&<><div className="facet-section"><h3>风味与香气</h3>{facetChips('aroma',FACETS.aroma)}</div><p className="facet-note">描述闻起来、尝起来像什么，不代表实际添加了这些原料。</p></>}
        {moreFilters==='place'&&<>{facetSelect('country',countryOptions,{allLabel:'全部地区'})}{facetSelect('brewery',breweryOptions,{allLabel:'全部酒厂',unknown:false})}<p className="facet-note">地区依各来源记录；获奖地区不等于已核验的生产地。</p></>}
        {moreFilters==='more'&&<>{facetSelect('process',FACETS.process,{allLabel:'不限工艺'})}{facetSelect('ingredient',FACETS.ingredient,{allLabel:'不限原料'})}<label className="check-filter"><input type="checkbox" aria-label="只看有图片和介绍" checked={photosOnly} onChange={event=>setPhotosOnly(event.target.checked)}/><span>有图片和介绍</span></label><label className="check-filter"><input type="checkbox" aria-label="只看可定位酒款" checked={mappedOnly} onChange={event=>setMappedOnly(event.target.checked)}/><span>可在地图定位</span></label><p className="facet-note">未提供表示资料缺失。工艺、原料只筛选有来源依据的记录。</p></>}
      </div>
    </section>}
  </section>;
}

export function TaxonomyDetail({record,onExplore}) {
  if(!record)return null;
  const dimensions=['taste','mouthfeel','aroma','process','ingredient'];
  const missing=dimensions.filter(dimension=>!record[dimension]?.length).map(dimension=>LABELS[dimension]);
  return <section className="taxonomy-detail" aria-label="酒款分类"><div className="taxonomy-row" data-dimension="family"><span>种类</span><div><button onClick={()=>onExplore('family',record.family)}>{STYLE_FAMILIES.find(option=>option.id===record.family)?.label||'未提供'}</button>{record.substyle&&<small>{record.substyle.label}</small>}</div></div>
    {dimensions.filter(dimension=>record[dimension]?.length).map(dimension=><div className="taxonomy-row" data-dimension={dimension} key={dimension}><span>{LABELS[dimension]}</span><div>{record[dimension].map(id=><button key={id} onClick={()=>onExplore(dimension,id)}>{FACETS[dimension].find(option=>option.id===id)?.label||id}</button>)}</div></div>)}
    {missing.length>0&&<p className="taxonomy-missing">{missing.join('、')}资料待补充</p>}
    {!!record.evidence?.length&&<details className="taxonomy-evidence"><summary>查看标签依据</summary>{record.evidence.map((item,index)=><p key={`${item.dimension}-${item.id}-${index}`}><b>{LABELS[item.dimension]||'种类'}</b> · {item.text}{item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noreferrer">原始来源 ↗</a>}</p>)}</details>}
  </section>;
}
