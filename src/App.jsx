import React, {useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, Bookmark, Check, ChevronDown, Compass, ExternalLink, Globe2, Grid2X2, Hop, Info, LocateFixed, MapPin, Minus, Plus, Search, SlidersHorizontal, Sparkles, Wheat, X, Scale, Share2, RotateCw, Wine, Coffee, Citrus, Leaf, Flame, Droplets} from 'lucide-react';
import GlobeView from './GlobeView.jsx';
import Announcements from './Announcements.jsx';
import IngredientPanel from './IngredientPanel.jsx';
import {allocateRegionBeerRecommendations} from './ingredient-recommendations.mjs';
import {INGREDIENT_TYPES, INGREDIENT_REGIONS} from './ingredient-regions.mjs';
import {canonicalCountry,countrySelectionKey,countrySelectionLabel} from './country-selection.mjs';
import {beerLaunchYear,matchesLaunchYear} from './beer-launch-year.mjs';
import {matchesAbvRange} from './abv-filter.mjs';
import {loadCatalog, loadCatalogBootstrap} from './catalog-loader.mjs';
import {hasDescribedPhoto, beerIntroduction} from './beer-photo-eligibility.mjs';
import {beerImageSource} from './beer-image-source.mjs';
import {recommendableBeerCandidates, chooseRandomBeer} from './random-beer.mjs';
import {createBeerPhotoIdentityIndex} from './beer-photo-identity.mjs';
import {createSparsePhotoScaleMap} from './sparse-photo-sizing.mjs';
import {contentImageStyle} from './photo-content-layout.mjs';
import FilterDock, {COLLECTIONS, TaxonomyDetail} from './FilterDock.jsx';
import {classifyBeer} from './beer-taxonomy.mjs';
import {EMPTY_FACETS, filterCatalog, countFacets, beerSearchText} from './catalog-filters.mjs';

const SAVED_KEY='brew-atlas-curated-saved-v1';
const readSaved=()=>{try{const v=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[];}catch{return [];}};
const number=(n,suffix='')=>Number.isFinite(n)?`${Number.isInteger(n)?n:Number(n.toFixed(1))}${suffix}`:'未提供';
const PAGE_SIZE=60;
const hasLocation=b=>!!b&&b.locationVerified===true&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180;
const inCollection=(beer,collection)=>beer.collections?.includes(collection)||beer.collection===collection;
const collectionName=c=>COLLECTIONS.find(option=>option.id===c)?.label||'本地资料';
const primaryCollection=beer=>COLLECTIONS.some(option=>option.id===beer?.collection)?beer.collection:'all';
const beerCollectionLabel=beer=>[COLLECTIONS.filter(option=>!['all','pictured'].includes(option.id)&&inCollection(beer,option.id)).map(option=>option.label).join(' · ')||collectionName(beer?.collection),['industrial','industrial_reference'].includes(beer?.craftStatus)||beer?.catalogRole==='industrial_reference'?'工业品牌参考':beer?.craftStatus==='corporate_owned_brand'?'集团旗下品牌':null].filter(Boolean).join(' · ');
const initialCollection=()=>{const params=new URLSearchParams(location.search);if(!['library','saved'].includes(params.get('view')))return'all';const value=params.get('collection');return COLLECTIONS.some(option=>option.id===value)?value:'all';};
const initialView=()=>{const value=new URLSearchParams(location.search).get('view');return ['globe','library','saved'].includes(value)?value:'globe';};
const awardsFor=beer=>Array.isArray(beer?.awards)?beer.awards:[];
const medalName=value=>({gold:'金奖',silver:'银奖',bronze:'铜奖'}[String(value).toLowerCase()]||value||'奖牌待核对');
const ratingText=value=>Number.isFinite(value)&&value>=0&&value<=5?value.toFixed(2):'未提供';
const scopeName=value=>value==='country'?'国家级':value==='subnational'?'地区级':'范围待核对';


function BottleImage({beer,className='',variant='card'}){
  const source=beerImageSource(beer,variant);
  const wrapperRef=useRef(null),[containerAspect,setContainerAspect]=useState(null);
  const [imageState,setImageState]=useState(()=>({source,status:'loading'}));
  const status=imageState.source===source?imageState.status:'loading';
  useEffect(()=>{setImageState(current=>current.source===source?current:{source,status:'loading'});const timer=setTimeout(()=>setImageState(current=>current.source===source&&current.status==='loading'?{source,status:'slow'}:current),12000);return()=>clearTimeout(timer);},[source]);
  useEffect(()=>{const wrapper=wrapperRef.current;if(!wrapper)return;const update=(width,height)=>{if(width>0&&height>0){const next=width/height;setContainerAspect(current=>current!==null&&Math.abs(current-next)<1e-6?current:next);}};update(wrapper.clientWidth,wrapper.clientHeight);const observer=new ResizeObserver(entries=>{for(const entry of entries)update(entry.contentRect.width,entry.contentRect.height);});observer.observe(wrapper);return()=>observer.disconnect();},[source]);
  const contentStyle=contentImageStyle(beer,containerAspect);
  if(!source){const reason=beer?.image?'酒款介绍待补充':'暂无实物图';return <div className={`image-fallback ${className}`} aria-label={reason}><Grid2X2 size={28}/><span>{reason}</span></div>;}
  const message=status==='failed'?'图片暂不可用':status==='slow'?'图片加载较慢':'图片加载中';
  return <div ref={wrapperRef} className={`beer-photo ${className}`} data-image-state={status} data-content-fit={Boolean(contentStyle)}><img src={source} style={contentStyle||undefined} alt={`${beer.name} 酒款图片`} loading={variant==='original'?'eager':'lazy'} decoding="async" referrerPolicy="no-referrer" onLoad={()=>setImageState({source,status:'ready'})} onError={()=>setImageState({source,status:'failed'})}/>{status!=='ready'&&<div className="image-fallback photo-status" aria-label={message}><Wine size={25}/><span>{message}</span></div>}</div>;
}
function Modal({open,onClose,title,children}){
  const ref=useRef();useEffect(()=>{const d=ref.current;if(open&&!d.open)d.showModal();else if(!open&&d.open)d.close();},[open]);
  return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><header><h2>{title}</h2><button className="icon-button" aria-label="关闭窗口" onClick={onClose}><X size={20}/></button></header>{children}</dialog>;
}
function BeerAwards({beer}){
  const awards=awardsFor(beer);if(!awards.length)return null;
  return <section className="beer-awards" aria-label="Untappd 获奖记录"><h3>Untappd 获奖记录</h3>{awards.map((award,index)=><div className="award-record" data-rating-year={award.ratingYear??''} data-award-medal={award.medal??''} key={`${award.ratingYear}-${award.region}-${award.medal}-${index}`}><div><strong>{award.ratingYear??'年份待核对'} 年度 · {medalName(award.medal)}</strong><span>{award.region||'获奖地区待核对'} · {scopeName(award.scope)}</span>{award.style&&<small>{award.style}</small>}</div><p className="award-rating"><b>{ratingText(award.rating)}</b><span>年度评分{Number.isFinite(award.rating)?' / 5':''}</span></p>{/^https?:\/\//i.test(award.sourceUrl||'')&&<a href={award.sourceUrl} target="_blank" rel="noreferrer" aria-label={`查看 ${award.ratingYear??''} ${award.region||''} 获奖来源`}>获奖来源 <ExternalLink size={11}/></a>}</div>)}<p className="award-explanation">年度按评分统计年份记录。</p></section>;
}
function BeerCard({beer,brewery,saved,onSave,onSelect}){
  const awards=awardsFor(beer),first=awards[0];
  return <article data-beer-id={beer.id} className={`beer-card ${!hasDescribedPhoto(beer)?'catalog-card':''}`}><button className="beer-card-main" aria-label={`查看 ${beer.name}`} onClick={()=>onSelect(beer)}><div className="card-image"><BottleImage beer={beer}/></div><div className="card-copy"><h3>{beer.name}</h3><p>{brewery?.countryBasis==='award_region'?'获奖地区：':''}{brewery?.countryZh||brewery?.country||'地区待核对'} · {beer.styleZh||beer.style||'风格待核对'}</p><span>{number(beer.abv,'%')} <small>ABV</small><i>{beerCollectionLabel(beer)}</i></span>{beerLaunchYear(beer)&&<p className="card-launch-year">{beerLaunchYear(beer)} 年 · {beer.launchYearEvidence.meaning==='recipe_version'?'此配方首酿':beer.launchYearEvidence.kind==='first_brewed'?'首次酿造':'首次推出'}</p>}{first&&<p className="card-award">{first.ratingYear??'年份待核对'} · {medalName(first.medal)} · {ratingText(first.rating)}{awards.length>1&&<small> +{awards.length-1} 项</small>}</p>}</div></button><button className={`card-save icon-button ${saved?'is-saved':''}`} aria-label={`${saved?'取消收藏':'收藏'} ${beer.name}`} onClick={()=>onSave(beer.id)}><Bookmark size={17} fill={saved?'currentColor':'none'}/></button></article>;
}
export default function App(){
  const [data,setData]=useState(null),[error,setError]=useState('');
  const [mapReady,setMapReady]=useState(false);
  const [bottlesVisible,setBottlesVisible]=useState(true);
  const [ingredientsEnabled,setIngredientsEnabled]=useState(true),[ingredientRegion,setIngredientRegion]=useState(null),[ingredientFocus,setIngredientFocus]=useState(null);
  const ingredientMarkers=useMemo(()=>ingredientsEnabled?INGREDIENT_REGIONS.map(region=>({...region,typeLabel:INGREDIENT_TYPES.find(type=>type.id===region.type)?.labelZh})):[],[ingredientsEnabled]);
  const [catalogComplete,setCatalogComplete]=useState(false),[catalogLoading,setCatalogLoading]=useState(false),[catalogLoadError,setCatalogLoadError]=useState(''),[catalogRetry,setCatalogRetry]=useState(0);
  const [view,setView]=useState(initialView),[collection,setCollection]=useState(initialCollection);
  useEffect(()=>{
    if(view!=='globe')return;
    if(collection!=='all')setCollection('all');
    const url=new URL(location.href);
    if(url.searchParams.get('collection')!=='all'){
      url.searchParams.set('collection','all');history.replaceState(history.state,'',url);
    }
  },[view,collection]);
  const [query,setQuery]=useState(''),[strength,setStrength]=useState('all'),[abvRange,setAbvRange]=useState(null),[selectedLaunchYear,setSelectedLaunchYear]=useState(null);
  const searchQuery=useDeferredValue(query);
  const [facets,setFacets]=useState({...EMPTY_FACETS});
  const [country,setCountry]=useState('all'),[photosOnly,setPhotosOnly]=useState(false),[mappedOnly,setMappedOnly]=useState(false),[page,setPage]=useState(1);
  const libraryRef=useRef(),countrySelectedFromMap=useRef(false),lastCameraFilter=useRef('');
  const [mapCountryName,setMapCountryName]=useState(null);
  const [selectedId,setSelectedId]=useState(null),[focusedBrewery,setFocusedBrewery]=useState(null),[trayId,setTrayId]=useState(null),[focusRequest,setFocusRequest]=useState(0);
  const [saved,setSaved]=useState(readSaved),[compare,setCompare]=useState([]),[compareOpen,setCompareOpen]=useState(false);
  const [detailOpen,setDetailOpen]=useState(false),[detailTab,setDetailTab]=useState('beer'),[about,setAbout]=useState(false),[moreFilters,setMoreFilters]=useState(false);
  const [toast,setToast]=useState(''),[zoom,setZoom]=useState(0),[reset,setReset]=useState(0),[autoRotate,setAutoRotate]=useState(false);
  const searchRef=useRef(),inspectorRef=useRef(),toastTimer=useRef();
  const pendingDeepLink=useRef(new URLSearchParams(location.search).get('beer'));
  const restoreDeepLink=catalog=>{const found=catalog.beers.find(beer=>beer.id===pendingDeepLink.current);if(!found)return false;pendingDeepLink.current=null;setSelectedId(found.id);setCollection(current=>current==='all'||(current==='pictured'&&hasDescribedPhoto(found))||inCollection(found,current)?current:primaryCollection(found));setFocusedBrewery(found.breweryId);setDetailOpen(true);return true;};
  const startCatalog=mapReady||view!=='globe';
  useEffect(()=>{if(!startCatalog)return;const controller=new AbortController();let active=true;(async()=>{
    const {catalog,complete}=await loadCatalogBootstrap({signal:controller.signal});if(!active)return;
    setData(catalog);setCatalogComplete(complete);
    if(complete){const ids=new Set(catalog.beers.map(beer=>beer.id));setSaved(current=>current.filter(id=>ids.has(id)));}
    if(!restoreDeepLink(catalog))setSelectedId(catalog.beers[0]?.id||null);
  })().catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);});return()=>{active=false;controller.abort();};},[startCatalog]);
  const loadedScopeComplete=useMemo(()=>{
    if(catalogComplete)return true;if(!data)return false;
    if(view==='saved'){const ids=new Set(data.beers.map(beer=>beer.id));return saved.every(id=>ids.has(id));}
    if(collection==='all')return false;
    const total=collection==='pictured'?data.metadata.counts.picturedBeers:data.metadata.collectionCounts[collection];
    return Number.isFinite(total)&&data.beers.filter(beer=>collection==='pictured'?hasDescribedPhoto(beer):inCollection(beer,collection)).length===total;
  },[data,catalogComplete,view,collection,saved]);
  const needsFullCatalog=Boolean(data&&!catalogComplete&&((!loadedScopeComplete&&(view!=='globe'||searchQuery.trim()))||pendingDeepLink.current));
  useEffect(()=>{
    if(!needsFullCatalog){setCatalogLoading(false);setCatalogLoadError('');return;}
    const controller=new AbortController();let active=true;setCatalogLoading(true);setCatalogLoadError('');
    (async()=>{const catalog=await loadCatalog({signal:controller.signal});if(!active)return;
      setData(catalog);setCatalogComplete(true);setCatalogLoading(false);
      const ids=new Set(catalog.beers.map(beer=>beer.id));setSaved(current=>current.filter(id=>ids.has(id)));
      restoreDeepLink(catalog);pendingDeepLink.current=null;
    })().catch(e=>{if(active&&e.name!=='AbortError'){setCatalogLoading(false);setCatalogLoadError(e.message);}});
    return()=>{active=false;controller.abort();};
  },[needsFullCatalog,catalogRetry]);
  useEffect(()=>{const url=new URL(location.href);url.searchParams.set('view',view);url.searchParams.set('collection',collection);if(url.href!==location.href)history.replaceState(history.state,'',url);},[view,collection]);
  useEffect(()=>{try{localStorage.setItem(SAVED_KEY,JSON.stringify(saved));}catch{}},[saved]);
  useEffect(()=>{const handler=e=>{if((e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))||((e.metaKey||e.ctrlKey)&&e.key==='k')){e.preventDefault();searchRef.current?.focus();}if(e.key==='Escape'){setIngredientRegion(null);setDetailOpen(false);setMoreFilters(false);setTrayId(null);}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  useEffect(()=>{inspectorRef.current?.scrollTo({top:0});},[selectedId,detailOpen]);
  const notify=msg=>{setToast(msg);clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),2400);};
  const beers=data?.beers||[],breweries=data?.breweries||[];
  const beerMap=useMemo(()=>new Map(beers.map(beer=>[beer.id,beer])),[data]);
  const savedIds=useMemo(()=>new Set(saved),[saved]);
  const knownYears=useMemo(()=>beers.map(beerLaunchYear).filter(year=>year!=null),[data]);
  const pictureIds=useMemo(()=>new Set(beers.filter(hasDescribedPhoto).map(beer=>beer.id)),[data]);
  const collectionCounts=useMemo(()=>{const counts={all:beers.length,pictured:pictureIds.size};for(const beer of beers)for(const id of new Set([...(beer.collections||[]),beer.collection].filter(id=>id&&!['all','pictured'].includes(id))))counts[id]=(counts[id]||0)+1;return !catalogComplete&&data?{...counts,...data.metadata.collectionCounts,all:data.metadata.counts.beers,pictured:data.metadata.counts.picturedBeers}:counts;},[data,pictureIds,catalogComplete]);
  const breweryMap=useMemo(()=>Object.fromEntries(breweries.map(b=>[b.id,{...b,country:canonicalCountry(b.country),countryAliases:[...new Set([b.country,...(Array.isArray(b.countryAliases)?b.countryAliases:[])].filter(Boolean))]}])),[data]);
  const taxonomyIndex=useMemo(()=>Object.fromEntries(beers.map(beer=>[beer.id,classifyBeer(beer)])),[data]);
  const photoIdentityIndex=useMemo(()=>createBeerPhotoIdentityIndex(beers),[data]);
  const ingredientRecommendationPlan=useMemo(()=>ingredientRegion?allocateRegionBeerRecommendations(INGREDIENT_REGIONS,beers,breweryMap,{taxonomyIndex,identityIndex:photoIdentityIndex}):null,[Boolean(ingredientRegion),data,breweryMap,taxonomyIndex,photoIdentityIndex]);
  const ingredientRecommendations=ingredientRecommendationPlan?.get(ingredientRegion?.id)||[];
  const sparsePhotoScales=useMemo(()=>{
    const places=new Map();
    for(const beer of photoIdentityIndex.deduplicate(beers.filter(hasDescribedPhoto))){
      const brewery=breweryMap[beer.breweryId];if(!hasLocation(brewery))continue;
      if(!places.has(brewery.id))places.set(brewery.id,{...brewery,photoBeers:[]});
      places.get(brewery.id).photoBeers.push(beer);
    }
    return createSparsePhotoScaleMap([...places.values()]);
  },[data,photoIdentityIndex,breweryMap]);
  const selections=useMemo(()=>({...facets,country,strength}),[facets,country,strength]);
  const selected=beerMap.get(selectedId)||beers[0],selectedBrewery=(selected&&breweryMap[selected.breweryId])||{};
  const needsSearchIndex=Boolean(searchQuery.trim());
  const searchIndex=useMemo(()=>needsSearchIndex?Object.fromEntries(beers.map(b=>[b.id,beerSearchText(b,breweryMap[b.breweryId])])):{},[data,breweryMap,needsSearchIndex]);
  const baseBeers=useMemo(()=>view==='saved'?beers.filter(beer=>savedIds.has(beer.id)):view==='globe'||collection==='all'?beers:beers.filter(beer=>collection==='pictured'?pictureIds.has(beer.id):inCollection(beer,collection)),[data,collection,view,savedIds,pictureIds]);
  const candidates=useMemo(()=>{const q=searchQuery.trim().toLowerCase();if(!q&&!photosOnly&&!mappedOnly&&!abvRange&&!selectedLaunchYear)return baseBeers;return baseBeers.filter(beer=>matchesAbvRange(beer,abvRange)&&matchesLaunchYear(beer,selectedLaunchYear)&&(!q||searchIndex[beer.id]?.includes(q))&&(!photosOnly||pictureIds.has(beer.id))&&(!mappedOnly||hasLocation(breweryMap[beer.breweryId])));},[baseBeers,searchQuery,photosOnly,mappedOnly,breweryMap,searchIndex,pictureIds,abvRange,selectedLaunchYear]);
  const filtered=useMemo(()=>Object.values(selections).every(value=>!value||value==='all')?candidates:filterCatalog(candidates,taxonomyIndex,breweryMap,selections),[candidates,taxonomyIndex,breweryMap,selections]);
  const randomCandidates=useMemo(()=>recommendableBeerCandidates(filtered,{identityIndex:photoIdentityIndex}),[filtered,photoIdentityIndex]);
  const facetCounts=useMemo(()=>countFacets(candidates,taxonomyIndex,breweryMap,selections),[candidates,taxonomyIndex,breweryMap,selections]);
  const countryOptions=useMemo(()=>moreFilters!=='place'?[]:[...new Map(baseBeers.map(b=>breweryMap[b.breweryId]).filter(b=>b?.country).map(b=>[countrySelectionKey(b.country),{id:countrySelectionKey(b.country),label:countrySelectionLabel(b.country,b.countryZh)}])).values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN')),[baseBeers,breweryMap,moreFilters]);
  const breweryOptions=useMemo(()=>moreFilters!=='place'?[]:[...new Set(baseBeers.map(b=>b.breweryId))].filter(id=>facetCounts.brewery[id]||facets.brewery===id).map(id=>({id,label:breweryMap[id]?.nameZh||breweryMap[id]?.name||id})).sort((a,b)=>a.label.localeCompare(b.label,'zh-CN')),[baseBeers,breweryMap,facetCounts,facets.brewery,moreFilters]);
  const substyleOptions=useMemo(()=>moreFilters!=='family'?[]:[...new Map(baseBeers.map(b=>taxonomyIndex[b.id]).filter(record=>record?.substyle&&(facets.family==='all'||record.family===facets.family)).map(record=>[record.substyle.id,record.substyle])).values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN')),[baseBeers,taxonomyIndex,facets.family,moreFilters]);
  const onFacet=(dimension,id)=>{countrySelectedFromMap.current=false;if(dimension==='country'){setMapCountryName(null);setCountry(countrySelectionKey(id));setFacets(previous=>({...previous,brewery:'all'}));}else if(dimension==='strength')setStrength(id);else setFacets(previous=>({...previous,[dimension]:id,...(dimension==='family'?{substyle:'all'}:{})}));setTrayId(null);};
  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),currentPage=Math.min(page,pageCount);
  const pagedBeers=filtered.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  useEffect(()=>{setPage(1);libraryRef.current?.scrollTo({top:0});},[query,facets,strength,country,photosOnly,mappedOnly,collection,view,saved,abvRange,selectedLaunchYear]);
  const changePage=next=>{setPage(next);libraryRef.current?.scrollTo({top:0});};
  const visibleBreweries=useMemo(()=>{const ids=new Set(filtered.map(b=>b.breweryId));return breweries.filter(b=>ids.has(b.id));},[data,filtered]);
  const mapBeers=useMemo(()=>filtered.filter(beer=>pictureIds.has(beer.id)&&hasLocation(breweryMap[beer.breweryId])),[filtered,breweryMap,pictureIds]);
  const mappedBreweries=useMemo(()=>{const ids=new Set(mapBeers.map(beer=>beer.breweryId));return visibleBreweries.filter(brewery=>ids.has(brewery.id));},[visibleBreweries,mapBeers]);
  const picturedBreweryIds=useMemo(()=>new Set(beers.filter(beer=>hasDescribedPhoto(beer)&&hasLocation(breweryMap[beer.breweryId])).map(beer=>beer.breweryId)),[data,breweryMap]);
  useEffect(()=>{const key=JSON.stringify([searchQuery,facets,strength,collection,country]);if(lastCameraFilter.current===key)return;lastCameraFilter.current=key;if(countrySelectedFromMap.current)return;if((mappedBreweries.length===1&&(searchQuery||Object.values(facets).some(value=>value!=='all')||strength!=='all'))||(mappedBreweries.length>0&&country!=='all')){setFocusedBrewery(mappedBreweries[0].id);setFocusRequest(n=>n+1);setAutoRotate(false);}},[mappedBreweries,searchQuery,facets,strength,collection,country]);
  const similar=useMemo(()=>{if(!selected||!detailOpen)return [];const ranked=[],knownStyle=selected.style&&!['Beer','Unknown','Unknown style','Unclassified Beer','Out of Category','Other Belgian-Style Ales','Specialty Beer','未提供','未知风格','未分类'].includes(selected.style);if(!knownStyle&&!selected.flavors?.length)return [];for(const beer of beers){if(beer.id===selected.id)continue;const score=(knownStyle&&beer.style===selected.style?2:0)+(beer.flavors||[]).filter(flavor=>selected.flavors?.includes(flavor)).length;if(!score||ranked.length===3&&score<=ranked[2].score)continue;const entry={beer,score},index=ranked.findIndex(item=>item.score<score);ranked.splice(index<0?ranked.length:index,0,entry);if(ranked.length>3)ranked.pop();}return ranked.map(item=>item.beer);},[data,selected,detailOpen]);
  const trayBeers=useMemo(()=>trayId?filtered.filter(beer=>beer.breweryId===trayId):[],[filtered,trayId]);
  const countries=useMemo(()=>new Set(visibleBreweries.map(b=>canonicalCountry(b.country)).filter(Boolean)).size,[visibleBreweries]);
  const resetFilters=()=>{countrySelectedFromMap.current=false;setMapCountryName(null);setAbvRange(null);setSelectedLaunchYear(null);setQuery('');setFacets({...EMPTY_FACETS});setStrength('all');setCountry('all');setPhotosOnly(false);setMappedOnly(false);};
  const isFiltered=!!(selectedLaunchYear||abvRange||query||Object.values(facets).some(value=>value!=='all')||strength!=='all'||country!=='all'||photosOnly||mappedOnly);
  const selectedCountryLabel=country==='all'?null:countrySelectionLabel(country,breweries.find(b=>canonicalCountry(b.country)===country)?.countryZh||mapCountryName);
  const selectMapCountry=selection=>{
    const normalized=selection?{...selection,country:countrySelectionKey(selection.country)}:null;
    const next=normalized?.country===country?null:normalized;
    countrySelectedFromMap.current=true;pendingDeepLink.current=null;
    setCountry(next?.country||'all');setMapCountryName(next?.name||null);
    setFacets(previous=>({...previous,brewery:'all'}));setFocusedBrewery(null);setTrayId(null);
    setDetailOpen(false);setIngredientRegion(null);setMoreFilters(false);setAutoRotate(false);
  };
  const changeAbvRange=range=>{setAbvRange(range);setStrength('all');setTrayId(null);};
  const closeDetails=()=>setDetailOpen(false);
  const chooseView=next=>{setIngredientRegion(null);pendingDeepLink.current=null;const url=new URL(location.href);url.searchParams.delete('beer');history.replaceState(history.state,'',url);setView(next);};
  const selectBeer=beer=>{setIngredientRegion(null);pendingDeepLink.current=null;if(!filtered.some(b=>b.id===beer.id)){setCollection(primaryCollection(beer));resetFilters();if(view==='saved'&&!savedIds.has(beer.id))chooseView('library');}setSelectedId(beer.id);setFocusedBrewery(hasLocation(breweryMap[beer.breweryId])?beer.breweryId:null);setFocusRequest(n=>n+1);setDetailTab('beer');setDetailOpen(true);setAutoRotate(false);setMoreFilters(false);};
  const selectBrewery=br=>{setIngredientRegion(null);pendingDeepLink.current=null;setFocusedBrewery(br.id);setTrayId(br.id);setFocusRequest(n=>n+1);setDetailOpen(false);setAutoRotate(false);};
  const chooseCollection=c=>{pendingDeepLink.current=null;const url=new URL(location.href);url.searchParams.set('collection',c);url.searchParams.delete('beer');history.replaceState({},'',url);setCollection(c);resetFilters();setTrayId(null);setFocusedBrewery(null);setReset(n=>n+1);setMoreFilters(false);};
  const selectIngredient=region=>{pendingDeepLink.current=null;setIngredientRegion(INGREDIENT_REGIONS.find(item=>item.id===region.id)||region);setDetailOpen(false);setTrayId(null);setAutoRotate(false);};
  const locateIngredient=region=>{setAutoRotate(false);setFocusedBrewery(null);setTrayId(null);setIngredientFocus(previous=>({...region,request:(previous?.request||0)+1}));};
  const goHome=()=>{chooseView('globe');chooseCollection('all');setDetailOpen(false);};
  const save=id=>{const exists=savedIds.has(id);setSaved(s=>exists?s.filter(x=>x!==id):[...s,id]);notify(exists?'已取消收藏':'已加入想尝清单');};
  const randomBeer=()=>{const beer=chooseRandomBeer(randomCandidates,{selectedId});if(!beer){notify('当前筛选暂无带实物图的酒款，请调整筛选。');return;}setToast('');selectBeer(beer);};
  const addCompare=id=>{if(compare.includes(id)){setCompare(c=>c.filter(x=>x!==id));return;}setCompare(c=>c.length===2?[c[1],id]:[...c,id]);notify('已加入对比');};
  const share=async()=>{const u=new URL(location.href);u.searchParams.set('beer',selected.id);try{await navigator.clipboard.writeText(u.href);notify('已复制同机酒款链接');}catch{history.replaceState({},'',u);notify('可复制当前地址栏链接');}};
  return <div className={`app view-${view}`} data-catalog-scope={catalogComplete?'full':'map'} data-startup-stage={data?'photos':mapReady?'regions':'globe'} aria-busy={catalogLoading}>
    <header className="topbar"><button className="brand" onClick={goHome} aria-label="返回地球漫游"><span className="brand-mark"><Hop size={22}/></span><span>BREW<span>ATLAS</span></span></button><nav className="main-nav" aria-label="主导航">{[{id:'globe',name:'地球',Icon:Globe2},{id:'library',name:'酒库',Icon:Grid2X2},{id:'saved',name:'想尝',Icon:Bookmark}].map(({id,name,Icon})=><button key={id} aria-label={name} className={view===id?'active':''} onClick={()=>{chooseView(id);resetFilters();setDetailOpen(false);setTrayId(null);}}><Icon size={16}/><span>{name}</span>{id==='saved'&&saved.length>0&&<b>{saved.length}</b>}</button>)}</nav><div className="header-tools"><Announcements onExplore={()=>{chooseCollection('regional');chooseView('library');setDetailOpen(false);}}/><span className="local-status"><i/>本地体验</span><button className="icon-button" aria-label="关于数据与使用方法" onClick={()=>setAbout(true)}><Info size={19}/></button></div></header>
    {(catalogLoading||catalogLoadError||error)&&<div className="catalog-load-status" role="status">{error?'酒款暂未载入，仍可浏览地球和原料产区。':catalogLoading?'正在加载完整酒库…':'完整酒库加载失败，已显示的酒款仍可浏览。'}{error?<button onClick={()=>location.reload()}>重试</button>:catalogLoadError&&<button onClick={()=>setCatalogRetry(n=>n+1)}>重试</button>}</div>}
    <main className="main-content">
      {view==='globe'?<><div className="map-summary"><span className="eyebrow">THE BEER PLANET</span><h1>一瓶酒，一座城。</h1>{data?<p><strong>{(!catalogComplete&&!isFiltered?(collectionCounts[collection]||filtered.length):filtered.length).toLocaleString()}</strong> 条收录 <i/> <strong>{mappedBreweries.length.toLocaleString()}</strong> 个可展地点 <i/> {countries} 个国家/地区</p>:<p role="status">{mapReady?'产区已就绪，酒瓶正在载入…':'正在展开原料产区…'}</p>}{selectedCountryLabel&&<button className="country-selection" aria-label="清除地图国家筛选" onClick={()=>selectMapCountry(null)} style={{display:'inline-flex',alignItems:'center',gap:8,marginTop:10,padding:'6px 10px',fontSize:11,color:'#e7cf98',background:'#203d36e8',border:'1px solid #bca67266',borderRadius:8,pointerEvents:'auto'}}><span>{selectedCountryLabel} · {mapBeers.length?`${mapBeers.length.toLocaleString()} 款可展示`:'暂无可展示酒图'}</span><X size={12}/></button>}</div>
        <section className="globe-stage" aria-label="交互式酒瓶地球"><GlobeView onReady={()=>{setMapReady(true);if(!performance.getEntriesByName('brew-map-interactive').length)performance.mark('brew-map-interactive');}} bottlesVisible={bottlesVisible} breweries={mappedBreweries} beers={mapBeers} sparsePhotoScales={sparsePhotoScales} photoIdentityIndex={photoIdentityIndex} searchActive={Boolean(searchQuery.trim())} selectedBreweryId={focusedBrewery} selectedBeerId={detailOpen?selectedId:null} onSelect={selectBrewery} onBeerSelect={selectBeer} autoRotate={autoRotate} focusRequest={focusRequest} zoomRequest={zoom} resetRequest={reset} ingredientRegions={ingredientMarkers} onIngredientSelect={selectIngredient} ingredientFocus={ingredientFocus} ingredientPanelOpen={!!ingredientRegion} selectedCountry={country} onCountrySelect={selectMapCountry}/></section>
        <div className="globe-tools"><button className="icon-button" aria-label="放大地球" title="放大" onClick={()=>setZoom(n=>n+1)}><Plus size={19}/></button><button className="icon-button" aria-label="缩小地球" title="缩小" onClick={()=>setZoom(n=>n-1)}><Minus size={19}/></button><span/><button className="icon-button" aria-label="重置地球视角" title="全球视角" onClick={()=>{setFocusedBrewery(null);setTrayId(null);setReset(n=>n+1);}}><LocateFixed size={18}/></button><button className={`icon-button ${autoRotate?'active':''}`} aria-label="切换自动旋转" aria-pressed={autoRotate} title="自动旋转" onClick={()=>setAutoRotate(x=>!x)}><RotateCw size={18}/></button><span/><button className={`icon-button ${bottlesVisible?'active':''}`} aria-label="显示或隐藏酒瓶" aria-pressed={bottlesVisible} title="酒瓶" onClick={()=>setBottlesVisible(value=>!value)}><Wine size={18}/></button><button className={`icon-button ${ingredientsEnabled?'active':''}`} aria-label="显示或隐藏原料产区" aria-pressed={ingredientsEnabled} title="原料种植产区" onClick={()=>{setIngredientsEnabled(value=>!value);setIngredientRegion(null);}}><Wheat size={18}/></button></div>
        <div className="map-hint">点国家筛酒 <span>·</span> 点海洋恢复 <span>·</span> 拖动旋转<br/><small>{ingredientsEnabled?<button className="ingredient-guide" onClick={()=>selectIngredient(INGREDIENT_REGIONS.find(region=>region.country==='China')||INGREDIENT_REGIONS[0])}>点植物，探索风味的起点</button>:'点酒瓶看资料 · 酒图随缩放放大'}</small></div>
        {data&&!filtered.length&&!needsFullCatalog&&<div className="map-empty"><Search size={25}/><p>{selectedCountryLabel?`${selectedCountryLabel}在当前筛选下暂无可展示酒图`:'没有找到这个组合'}</p><button className="text-button" onClick={resetFilters}>清除筛选 <ArrowRight size={14}/></button></div>}
        {filtered.length>0&&!mappedBreweries.length&&<div className="map-empty"><MapPin size={25}/><p>这些记录的图片、介绍或位置待补充</p><button className="text-button" onClick={()=>chooseView('library')}>在酒库查看 <ArrowRight size={14}/></button></div>}
        {trayBeers.length>0&&!detailOpen&&<section className="brewery-tray" aria-label="此酒厂的酒款"><header><div><h2>{breweryMap[trayId]?.nameZh||breweryMap[trayId]?.name}</h2><span>{breweryMap[trayId]?.countryZh} · {trayBeers.length} 款</span></div><button className="icon-button" aria-label="关闭酒厂酒款" onClick={()=>setTrayId(null)}><X size={18}/></button></header><div className="tray-bottles">{trayBeers.map(b=><button key={b.id} aria-label={`查看 ${b.name}`} onClick={()=>selectBeer(b)}><BottleImage beer={b} variant="thumbnail"/><span>{b.name}</span></button>)}</div></section>}
      </>:<section ref={libraryRef} className="library-content"><header className="library-heading"><h1>{view==='saved'?'下一杯，想尝这些。':'风味酒库'}</h1><span>{loadedScopeComplete?`${view==='saved'&&saved.length>0?'Esther ':''}${filtered.length.toLocaleString()}${view==='saved'?'':' '}条记录`:`已显示 ${filtered.length.toLocaleString()} 条 · ${catalogLoadError?"完整酒库尚未载入":"完整酒库载入中"}`}</span></header>{filtered.length?<><nav className="pagination" aria-label="酒库分页"><button aria-label="上一页" disabled={currentPage===1} onClick={()=>changePage(currentPage-1)}>上一页</button><span className="page-position">{(currentPage-1)*PAGE_SIZE+1}–{Math.min(currentPage*PAGE_SIZE,filtered.length)} / {filtered.length.toLocaleString()}</span><button aria-label="下一页" disabled={currentPage===pageCount} onClick={()=>changePage(currentPage+1)}>下一页</button></nav><div className="beer-grid">{pagedBeers.map(b=><BeerCard key={b.id} beer={b} brewery={breweryMap[b.breweryId]} saved={savedIds.has(b.id)} onSave={save} onSelect={selectBeer}/>)}</div></>:<div className="empty-state"><Bookmark size={35}/><h2>{needsFullCatalog?(catalogLoadError?'完整酒库尚未载入':'正在加载完整酒库…'):view==='saved'&&!saved.length?'留下一杯让你好奇的酒。':'没有匹配的酒款'}</h2><button className="primary-button" onClick={()=>{resetFilters();if(view==='saved'&&!saved.length)chooseView('library');}}>{view==='saved'&&!saved.length?'去酒库看看':'清除筛选'}<ArrowRight size={16}/></button></div>}</section>}
    </main>
    {view==='globe'&&<IngredientPanel region={ingredientRegion} onSelect={selectIngredient} onLocate={locateIngredient} onClose={()=>setIngredientRegion(null)} recommendations={ingredientRecommendations} onBeerSelect={selectBeer}/>}
    <FilterDock detailOpen={detailOpen} selectedLaunchYear={selectedLaunchYear} onYearRangeChange={value=>{setSelectedLaunchYear(value);setTrayId(null);}} yearKnownCount={knownYears.length} years={knownYears} yearBeers={filtered} onYearBeerSelect={selectBeer} selectedCountryLabel={selectedCountryLabel} onClearCountry={()=>selectMapCountry(null)} abvRange={abvRange} onAbvRangeChange={changeAbvRange} searchRef={searchRef} query={query} setQuery={setQuery} view={view} collectionCounts={collectionCounts} collection={collection} chooseCollection={chooseCollection} selections={selections} onFacet={onFacet} counts={facetCounts} substyles={substyleOptions} countryOptions={countryOptions} breweryOptions={breweryOptions} photosOnly={photosOnly} setPhotosOnly={setPhotosOnly} mappedOnly={mappedOnly} setMappedOnly={setMappedOnly} moreFilters={moreFilters} setMoreFilters={setMoreFilters} resetFilters={resetFilters} isFiltered={isFiltered} randomBeer={randomBeer} resultCount={filtered.length}/>
    {selected&&detailOpen&&<><button className="detail-backdrop" aria-label="关闭详情背景" onClick={closeDetails}/><aside ref={inspectorRef} className="inspector detail-open" aria-label="酒款详情" data-beer-id={selected.id}><header className="inspector-top"><span>{beerCollectionLabel(selected)}</span><button className="random-button inspector-random-button" aria-label="随机下一杯" onClick={randomBeer} disabled={!randomCandidates.length}><Sparkles size={14}/><span>下一杯</span></button><button className="icon-button" aria-label="关闭酒款详情" onClick={closeDetails}><X size={20}/></button></header><div className={`inspector-hero ${!hasDescribedPhoto(selected)?'no-photo':''}`}><div className="bottle-aura"/><BottleImage beer={selected} className="hero-bottle" variant="original"/><button className={`hero-save icon-button ${savedIds.has(selected.id)?'is-saved':''}`} aria-label={`${savedIds.has(selected.id)?'取消收藏':'收藏'}当前酒款`} onClick={()=>save(selected.id)}><Bookmark size={21} fill={savedIds.has(selected.id)?'currentColor':'none'}/></button></div><div className="inspector-body"><div className="detail-location"><MapPin size={13}/>{selectedBrewery.countryBasis==='award_region'?'获奖地区：':''}{selectedBrewery.countryZh||selectedBrewery.country||'地区未提供'}{(selectedBrewery.cityZh||selectedBrewery.city)?` · ${selectedBrewery.cityZh||selectedBrewery.city}`:''}</div><h2>{selected.name}</h2><p className="detail-style">{selected.styleZh||selected.style||'风格待核对'}</p><p className="beer-launch-year">{beerLaunchYear(selected)?`${selected.launchYearEvidence.meaning==='recipe_version'?'此配方首酿':selected.launchYearEvidence.kind==='first_brewed'?'首次酿造':'首次推出'} · ${beerLaunchYear(selected)} 年`:'诞生年份未查到'}{beerLaunchYear(selected)&&<a href={selected.launchYearEvidence.sourceUrl} target="_blank" rel="noreferrer">年份依据 ↗</a>}</p><BeerAwards beer={selected}/>{selected.salesEvidence?.sourceUrl&&<p className="catalog-note">{selected.salesEvidence.claim} · {selected.salesEvidence.checkedAt}<br/><a href={selected.salesEvidence.sourceUrl} target="_blank" rel="noreferrer">查看畅销依据 ↗</a></p>}<div className="beer-stats"><div><strong className={selected.abv==null?'missing-value':''}>{number(selected.abv)}{typeof selected.abv==='number'&&<small>%</small>}</strong><span>酒精度 ABV</span></div><div><strong className={selected.ibu==null?'missing-value':''}>{number(selected.ibu)}</strong><span>苦度 IBU</span></div></div><div className="detail-tabs"><button className={detailTab==='beer'?'active':''} onClick={()=>setDetailTab('beer')}>酒款</button><button className={detailTab==='brewery'?'active':''} onClick={()=>setDetailTab('brewery')}>酒厂</button></div>{detailTab==='beer'?<><TaxonomyDetail record={taxonomyIndex[selected.id]} onExplore={(dimension,id)=>{chooseView('globe');setCollection('all');resetFilters();setFacets({...EMPTY_FACETS,[dimension]:id});setDetailOpen(false);setTrayId(null);}}/><p className="tasting-note">{beerIntroduction(selected)||'来源未提供酒款描述。'}</p>{selected.representativeReason&&<p className="catalog-note">{selected.representativeReason}</p>}{(selected.hops?.length>0||selected.malts?.length>0||selected.yeast)&&<details className="recipe-details"><summary>原料与搭餐</summary><dl className="ingredients">{selected.hops?.length>0&&<div><dt>酒花</dt><dd>{selected.hops.join(' · ')}</dd></div>}{selected.malts?.length>0&&<div><dt>麦芽</dt><dd>{selected.malts.join(' · ')}</dd></div>}{selected.yeast&&<div><dt>酵母</dt><dd>{selected.yeast}</dd></div>}</dl>{selected.foodPairings?.length>0&&<p>{selected.foodPairings.join(' / ')}</p>}</details>}</>:<div className="brewery-story"><h3>{selectedBrewery.name||'酒厂资料未提供'}</h3><p>{selectedBrewery.description}</p><p className="location-note">{!hasLocation(selectedBrewery)?'酒厂位置待核验':selectedBrewery.locationRole==='brand_reference'?(selectedBrewery.locationPrecision==='historical'?'品牌的历史参考位置 · 未核验现址':'品牌参考位置 · 非逐款生产地'):selectedBrewery.locationPrecision==='historical'?'历史酒厂位置 · 未核验现址':selectedBrewery.locationPrecision==='city'?'城市级参考位置':'酒厂参考位置'}</p><button disabled={!picturedBreweryIds.has(selectedBrewery.id)} className="text-button" onClick={()=>{chooseView('globe');setCollection('all');resetFilters();setFocusedBrewery(selectedBrewery.id);setTrayId(selectedBrewery.id);setFocusRequest(n=>n+1);setDetailOpen(false);setAutoRotate(false);}}>在地图上查看 <ArrowRight size={14}/></button>{/^https?:\/\//i.test(selectedBrewery.website||'')&&<a href={selectedBrewery.website} target="_blank" rel="noreferrer">酒厂官网 <ExternalLink size={12}/></a>}</div>}<div className="detail-actions"><button className={compare.includes(selected.id)?'active':''} onClick={()=>addCompare(selected.id)}><Scale size={15}/>{compare.includes(selected.id)?'已加入对比':'加入对比'}</button><button onClick={share}><Share2 size={15}/>分享</button></div>{similar.length>0&&<div className="similar"><h4>相近酒款</h4><div>{similar.map(b=><button key={b.id} onClick={()=>selectBeer(b)}><BottleImage beer={b} variant="thumbnail"/><span>{b.name}</span></button>)}</div></div>}</div></aside></>}
    {compare.length>0&&<div className="compare-dock"><Scale size={16}/><span>{compare.length}/2 款</span><button disabled={compare.length<2} onClick={()=>setCompareOpen(true)}>对比 <ArrowRight size={13}/></button><button className="icon-button" aria-label="清空对比" onClick={()=>setCompare([])}><X size={16}/></button></div>}
    {toast&&<div className="toast" role="status"><Check size={15}/>{toast}</div>}
    <Modal open={about} onClose={()=>setAbout(false)} title="关于这颗风味地球"><div className="about-content"><div className="about-stats"><span><b>{(collectionCounts.all||beers.length).toLocaleString()}</b>当前收录</span><span><b>{(collectionCounts.awards||0).toLocaleString()}</b>获奖饮品</span><span><b>{(collectionCounts.representative||0).toLocaleString()}</b>全球代表</span><span><b>{picturedBreweryIds.size.toLocaleString()}</b>可展地点</span></div><p>当前酒库汇集已有本地资料、公开目录、历史酒款，以及 Untappd 获奖与全球代表标签；各组可以重合。来源数量表示收录记录，跨来源可能仍有同款，历史资料不代表当前仍在售。</p><p>获奖记录保留评分年度、地区、奖牌及年度分数。年度指评分统计年份，评分人数未提供时不补写；年度获奖与销量排行含义不同。具体依据可在酒款详情查看。</p><p>地图只展示有图片、真实介绍和已核验参考位置的酒款；资料尚不齐全的记录仍可在酒库检索。酒图在来源位置附近展开，展示位置不改变来源坐标。获奖地区按奖项分组记录；酒厂参考位置可能精确到城市，不代表每款酒的生产厂址。</p><p>缩放时保留已有酒图的位置，并向空位补充更多酒款。重复图片默认只展示一张，通用占位图默认隐藏；输入搜索词后可查看匹配记录。点击酒瓶查看详情。</p><p>缺失参数与风味资料保持为空。收藏仅保存在这台浏览器；当前目录与地图从本机加载，外部资料链接按需打开。</p><div className="about-links"><a href="https://awards.untappd.com/explore/" target="_blank" rel="noreferrer">Untappd 获奖目录 <ExternalLink size={12}/></a><a href="https://awards.untappd.com/about/" target="_blank" rel="noreferrer">评奖与年度说明 <ExternalLink size={12}/></a></div></div></Modal>
    <Modal open={compareOpen} onClose={()=>setCompareOpen(false)} title="两杯风味，一起看看"><div className="comparison">{compare.map(id=>beerMap.get(id)).filter(Boolean).map(b=><div key={b.id}><div className="comparison-image"><BottleImage beer={b}/></div><span className="country-label">{breweryMap[b.breweryId]?.countryZh} · {collectionName(b.collection)}</span><h3>{b.name}</h3><p>{b.styleZh}</p><dl><div><dt>酒精度</dt><dd>{number(b.abv,'%')}</dd></div><div><dt>苦度</dt><dd>{number(b.ibu)}</dd></div><div><dt>风味</dt><dd>{b.flavors?.join(' · ')||'未整理'}</dd></div><div><dt>酒花</dt><dd>{b.hops?.join(' · ')||'未提供'}</dd></div></dl></div>)}</div><p className="comparison-footnote">参数以各酒款来源为准；IBU 不能单独代表主观口感。</p></Modal>
  </div>;
}
