import React from 'react';
import {Search, X, ChevronDown, Sparkles, RotateCw, Grid2X2, Droplets, Leaf, MapPin, SlidersHorizontal} from 'lucide-react';
import {STYLE_FAMILIES, FACETS} from './beer-taxonomy.mjs';

export const COLLECTIONS = Object.freeze([{id:'all',label:'全部酒库'},{id:'awards',label:'Untappd 获奖'},{id:'representative',label:'全球代表'},{id:'pictured',label:'有图酒库'},{id:'beertasting',label:'BeerTasting'},{id:'off',label:'Open Food Facts'},{id:'world',label:'世界酒款'},{id:'archive',label:'历史酒款 · 旧资料'},{id:'openbeer',label:'Open Beer'},{id:'local',label:'本地资料'}]);

const LABELS = {family:'种类',substyle:'子风格',taste:'口味',mouthfeel:'口感',aroma:'风味',process:'制作工艺',ingredient:'原料',brewery:'酒厂',country:'国家或地区',strength:'酒精度'};
const tabs = [{id:'family',label:'种类',Icon:Grid2X2,keys:['family','substyle']},{id:'taste',label:'口味与口感',Icon:Droplets,keys:['taste','mouthfeel']},{id:'aroma',label:'风味',Icon:Leaf,keys:['aroma']},{id:'place',label:'酒厂与地区',Icon:MapPin,keys:['country','brewery']},{id:'more',label:'更多',Icon:SlidersHorizontal,keys:['process','ingredient','strength']}];
const formatter = new Intl.NumberFormat('zh-CN');

function SelectFacet({dimension,options,value,onChange,counts={},allLabel='全部',unknown=true}) {
  const items=[{id:'all',label:allLabel},...options.filter(option=>option.id!=='all'&&option.id!=='unknown'),...(unknown?[{id:'unknown',label:'未提供'}]:[])];
  return <label className="facet-select"><span>{LABELS[dimension]}</span><select aria-label={`按${LABELS[dimension]}筛选`} data-facet={dimension} value={value} onChange={event=>onChange(event.target.value)}>{items.map(({id,label})=><option key={id} value={id} disabled={id!=='all'&&id!==value&&!counts[id]}>{label} · {formatter.format(counts[id]||0)}</option>)}</select></label>;
}

function Chips({dimension,options,value,onChange,counts={},allLabel='不限',unknown=true}) {
  const items=[{id:'all',label:allLabel},...options.filter(option=>option.id!=='unknown'),...(unknown?[{id:'unknown',label:'未提供'}]:[])];
  return <div className={`facet-chips ${dimension==='family'?'family-chips':''}`} aria-label={`${LABELS[dimension]}选项`}>{items.map(({id,label})=><button key={id} data-facet={dimension} data-value={id} data-count={counts[id]||0} className={value===id?'active':''} aria-pressed={value===id} disabled={id!=='all'&&id!==value&&!counts[id]} onClick={()=>onChange(value===id?'all':id)}><span>{label}</span><small>{formatter.format(counts[id]||0)}</small></button>)}</div>;
}

export default function FilterDock({searchRef,query,setQuery,view,collectionCounts,collection,chooseCollection,selections,onFacet,counts,substyles,countryOptions,breweryOptions,photosOnly,setPhotosOnly,mappedOnly,setMappedOnly,moreFilters,setMoreFilters,resetFilters,isFiltered,randomBeer,resultCount}) {
  const facetSelect=(dimension,options,extra={})=><SelectFacet dimension={dimension} options={options} value={selections[dimension]} onChange={id=>onFacet(dimension,id)} counts={counts[dimension]} {...extra}/>;
  const facetChips=(dimension,options,extra={})=><Chips dimension={dimension} options={options} value={selections[dimension]} onChange={id=>onFacet(dimension,id)} counts={counts[dimension]} {...extra}/>;
  return <section className="filter-dock taxonomy-dock" aria-label="底部筛选">
    <div className="dock-main"><label className="search-box"><Search size={16}/><input ref={searchRef} aria-label="搜索酒款酒厂或国家" placeholder="搜索酒名、酒厂、国家" value={query} onChange={event=>setQuery(event.target.value)}/>{query?<button aria-label="清空搜索" onClick={()=>setQuery('')}><X size={14}/></button>:<kbd>/</kbd>}</label>
      <span className="dock-divider"/>{view!=='saved'&&<label className="collection-select"><select aria-label="选择数据集" value={collection} onChange={event=>chooseCollection(event.target.value)}>{COLLECTIONS.map(({id,label})=><option key={id} value={id}>{label} · {formatter.format(collectionCounts[id]||0)}</option>)}</select><ChevronDown size={13}/></label>}
      <button className="reset-filter dock-reset" aria-label="清除全部筛选" title="重置筛选" disabled={!isFiltered} onClick={resetFilters}><RotateCw size={15}/><span>重置</span></button>
      <button className="random-button" onClick={randomBeer} disabled={!resultCount} aria-label="随机遇见一杯"><Sparkles size={15}/><span>随机一杯</span></button>
    </div>
    <nav className="facet-tabs" aria-label="分类筛选维度">{tabs.map(({id,label,Icon,keys})=>{const selected=keys.filter(key=>selections[key]&&selections[key]!=='all').length+(id==='more'?Number(photosOnly)+Number(mappedOnly):0);return <button key={id} className={(moreFilters||'family')===id?'active':''} aria-label={id==='more'?'更多筛选':label} aria-expanded={moreFilters===id} onClick={()=>setMoreFilters(moreFilters===id?false:id)}><Icon size={13}/><span>{label}</span>{selected>0&&<b>{selected}</b>}</button>;})}</nav>
    {facetChips('family',STYLE_FAMILIES,{allLabel:'全部种类'})}
    {moreFilters&&<section className="facet-panel" aria-label="详细筛选"><header><strong>{tabs.find(tab=>tab.id===moreFilters)?.label}</strong><span>{formatter.format(resultCount)} 条匹配</span><button aria-label="收起筛选" className="icon-button" onClick={()=>setMoreFilters(false)}><X size={16}/></button></header>
      <div className="facet-panel-body">
        {moreFilters==='family'&&<>{facetSelect('family',STYLE_FAMILIES,{allLabel:'全部种类'})}{facetSelect('substyle',substyles,{allLabel:'全部子风格'})}<p className="facet-note">先选大类，再找具体风格。</p></>}
        {moreFilters==='taste'&&<><div className="facet-section"><h3>口味</h3>{facetChips('taste',FACETS.taste)}</div><div className="facet-section"><h3>口感</h3>{facetChips('mouthfeel',FACETS.mouthfeel)}</div><p className="facet-note">口味与口感来自酒款资料；IBU 不等同于喝起来的苦感。</p></>}
        {moreFilters==='aroma'&&<><div className="facet-section"><h3>风味与香气</h3>{facetChips('aroma',FACETS.aroma)}</div><p className="facet-note">描述闻起来、尝起来像什么，不代表实际添加了这些原料。</p></>}
        {moreFilters==='place'&&<>{facetSelect('country',countryOptions,{allLabel:'全部地区'})}{facetSelect('brewery',breweryOptions,{allLabel:'全部酒厂',unknown:false})}<p className="facet-note">地区依各来源记录；获奖地区不等于已核验的生产地。</p></>}
        {moreFilters==='more'&&<>{facetSelect('process',FACETS.process,{allLabel:'不限工艺'})}{facetSelect('ingredient',FACETS.ingredient,{allLabel:'不限原料'})}{facetSelect('strength',[{id:'light',label:'≤ 4.5%'},{id:'balanced',label:'4.5%–7%'},{id:'strong',label:'> 7%'}],{allLabel:'不限'})}<label className="check-filter"><input type="checkbox" aria-label="只看有图片和介绍" checked={photosOnly} onChange={event=>setPhotosOnly(event.target.checked)}/><span>有图片和介绍</span></label><label className="check-filter"><input type="checkbox" aria-label="只看可定位酒款" checked={mappedOnly} onChange={event=>setMappedOnly(event.target.checked)}/><span>可在地图定位</span></label><p className="facet-note">未提供表示资料缺失。工艺、原料只筛选有来源依据的记录。</p></>}
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
