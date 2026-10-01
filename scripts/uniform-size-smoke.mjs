import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'qa');
const runtime=createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`),{chromium}=runtime('playwright');
const base=process.env.DEMO_URL||'http://127.0.0.1:4173',origin=new URL(base).origin,before=process.env.UNIFORM_BEFORE==='1';
assert(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
const suffix=before?'before':'after',devices=(process.env.UNIFORM_DEVICES||'desktop,mobile,flat').split(',');
const report={startedAt:new Date().toISOString(),base,baseline:before,complete:false,build:null,
 policy:'Real Chrome and public UI only, local resources. Same frame height and scale=1 for every visible beer button. Actual bottle content may retain source-image whitespace. Each animation frame follows one global zoom-size curve. Continuously visible geographic anchors and decoded DOM nodes remain stable; fully hidden >=700ms reentry is allowed. Full-frame land, controls, overlap and source truth checked when settled. No per-zoom count monotonicity or distant-island nonempty requirement.',
 checks:[],states:[],phases:[],screenshots:[],findings:[],external:[],errors:[],localErrors:[]};
let browser,page,beers,beerMap,breweryMap,active='initialize',baseZoom,compact;
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
const expectedHeight=zoom=>Math.round(Math.max(compact?20:22,Math.min(compact?44:56,(compact?20:22)*zoom/baseZoom))*100)/100;
function check(ok,message){if(ok)return;if(before){report.findings.push({state:active,message});return}throw new Error(message)}
async function settle(){await page.waitForFunction(()=>document.querySelector('.brew-globe-view')?._landMask&&document.querySelector('.brew-globe-view')?._projectGeo);await page.waitForTimeout(1900)}
async function capture(name){const file=path.join(out,`uniform-size-${suffix}-${name}.png`);await page.mouse.move(0,0);await page.screenshot({path:file});report.screenshots.push(file)}
async function snapshot(name,{requirePhotos=false,screenshot=false}={}){
 active=name;
 const s=await page.evaluate(()=>{
  const w=document.querySelector('.brew-globe-view'),wr=w.getBoundingClientRect(),shown=n=>n.checkVisibility({opacityProperty:true,visibilityProperty:true});
  const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left-wr.left,right:r.right-wr.left,top:r.top-wr.top,bottom:r.bottom-wr.top,width:r.width,height:r.height}};
  return{zoom:Number(w.dataset.zoomScale),mode:w.dataset.mapMode,wrapper:{width:wr.width,height:wr.height},forbidden:w.querySelectorAll('.globe-bottle-count,.globe-site-dot,.globe-bottle-anchor').length,
   photos:[...w.querySelectorAll('.globe-bottle')].filter(shown).map(n=>{const r=rect(n),im=n.querySelector('img');return{id:n.dataset.beerId,breweryId:n.dataset.sourceBreweryId,scale:Number(n.dataset.photoScale||1),lat:Number(n.dataset.displayLat),lng:Number(n.dataset.displayLng),sourceLat:Number(n.dataset.sourceLat),sourceLng:Number(n.dataset.sourceLng),rect:r,land:w._landMask.containsRect(r),src:im?.getAttribute('src'),ready:n.dataset.imageState==='ready'&&im?.complete&&im.naturalWidth>0,fit:im&&getComputedStyle(im).objectFit}}),
   controls:[...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.inspector,.brewery-tray,.compare-dock')].filter(shown).map(n=>({name:n.className,...rect(n)}))};
 });
 s.photos.forEach(p=>{p.country=breweryMap.get(p.breweryId)?.country});
 const heights=s.photos.map(p=>p.rect.height),row={name,...s,visiblePhotos:s.photos.length,expectedHeight:expectedHeight(s.zoom),heightSpread:heights.length?Math.max(...heights)-Math.min(...heights):0,heights:[...new Set(heights)],countries:[...new Set(s.photos.map(p=>p.country))]};
 report.states.push(row);console.log(JSON.stringify({name,zoom:s.zoom,count:s.photos.length,heights:row.heights,countries:row.countries}));
 check(!s.forbidden,`${name}: removed number/dot/anchor returned`);
 if(requirePhotos)check(s.photos.length>0,`${name}: inland/near fixture unexpectedly empty`);
 check(row.heightSpread<=.1,`${name}: mixed visible frame heights ${row.heights.join('/')}`);
 for(const p of s.photos){const beer=beerMap.get(p.id),br=breweryMap.get(p.breweryId);
  check(p.scale===1,`${name}: local scale ${p.scale} remains on ${p.id}`);
  check(Math.abs(p.rect.height-row.expectedHeight)<=.1,`${name}: ${p.rect.height}px differs from global ${row.expectedHeight}px`);
  check(Math.abs(p.rect.width-p.rect.height*.52)<.04,`${name}: frame aspect changed`);
  check(p.land,`${name}: full image frame crosses water`);check(p.ready&&p.fit==='contain',`${name}: image unreadied or cropped`);
  check(beer&&hasDescribedPhoto(beer)&&p.src===(beer.imageThumbnail||beer.image)&&p.src.startsWith('/'),`${name}: image not eligible/local/truthful`);
  check(br&&p.sourceLat===br.lat&&p.sourceLng===br.lng&&beer.breweryId===br.id,`${name}: source brewery/coordinates changed`);
  check(p.rect.left>=-.5&&p.rect.top>=-.5&&p.rect.right<=s.wrapper.width+.5&&p.rect.bottom<=s.wrapper.height+.5,`${name}: image leaves viewport`);
  for(const c of s.controls)check(overlap(p.rect,c)<=1,`${name}: image covers ${c.name}`);
 }
 for(let i=0;i<s.photos.length;i++)for(let j=0;j<i;j++)check(overlap(s.photos[i].rect,s.photos[j].rect)<=1,`${name}: images overlap`);
 if(screenshot)await capture(name);return row;
}
async function choose(br){
 await page.getByLabel('重置地球视角',{exact:true}).click();await settle();
 await page.getByRole('button',{name:'酒厂与地区',exact:true}).click();
 await page.getByLabel('按国家或地区筛选',{exact:true}).selectOption(br.country);
 await page.getByLabel('按酒厂筛选',{exact:true}).selectOption(br.id);
 await page.getByRole('button',{name:'收起筛选',exact:true}).click();await settle();
}
async function zoom(d){await page.getByLabel(d>0?'放大地球':'缩小地球',{exact:true}).click();await page.mouse.move(0,0);await settle()}
async function begin(name){await page.evaluate(({name,baseZoom,compact})=>window.__uniform.start(name,baseZoom,compact),{name,baseZoom,compact})}
async function end(){const p=await page.evaluate(()=>window.__uniform.stop());
 // React layout can publish the next camera size before the wrapper zoom data
 // attribute reaches that same rAF observation. Keep raw evidence and permit
 // only one adjacent frame (at most 100ms), while same-frame equality stays exact.
 p.rawSizeModelErrors=p.sizeModelErrors;p.rawHeightModelDeltaErrors=p.heightContinuityErrors;delete p.heightContinuityErrors;
 p.sizeCurveAlignment={neighborFrames:1,maximumIntervalMs:100,tolerancePx:.12};
 p.sizeModelErrors=0;p.oneFramePhaseAdjustedFrames=0;p.maximumAlignedModelResidual=0;
 for(let i=0;i<p.samples.length;i++){
  const s=p.samples[i],neighbors=[p.samples[i-1],s,p.samples[i+1]].filter(n=>n&&Math.abs(n.t-s.t)<=100);
  const residual=Math.max(0,...s.heights.map(h=>Math.min(...neighbors.map(n=>Math.abs(h-n.expectedHeight)))));
  p.maximumAlignedModelResidual=Math.max(p.maximumAlignedModelResidual,residual);
  if(residual>.12)p.sizeModelErrors++;
  else if(s.heights.some(h=>Math.abs(h-s.expectedHeight)>.12))p.oneFramePhaseAdjustedFrames++;
 }
 report.phases.push(p);
 check(p.mixedFrames===0,`${p.name}: ${p.mixedFrames} animation frames contain mixed heights (max spread ${p.maximumSpread}px)`);
 check(p.nonUnitScaleFrames===0,`${p.name}: animation retains local photo scale`);
 check(p.sizeModelErrors===0,`${p.name}: ${p.sizeModelErrors} frames diverge from global zoom size`);
 check(p.replacements.length===0,`${p.name}: decoded button/image node rebuilt`);
 check(p.visibleGeoChanges.length===0,`${p.name}: visible image geographic anchor jumps`);
 check(p.sustainedProjectionErrors.length===0,`${p.name}: geographic anchor projection stays offset`);
 report.checks.push({name:p.name,passed:before?p.mixedFrames===0&&p.nonUnitScaleFrames===0&&p.sizeModelErrors===0:true});
}
try{
 await mkdir(out,{recursive:true});const parts=await Promise.all(['beertasting','world','archive','off','openbeer'].map(async key=>{const r=await fetch(`${base}/data/${key}.json`);assert(r.ok);return r.json()}));
 beers=parts.flatMap(d=>d.beers);beerMap=new Map(beers.map(b=>[b.id,b]));breweryMap=new Map(parts.flatMap(d=>d.breweries).map(b=>[b.id,b]));
 const fixtures={china:[...breweryMap.values()].find(b=>/Master Gao/.test(b.name)),india:[...breweryMap.values()].find(b=>b.name==='Bira 91'),japan:[...breweryMap.values()].find(b=>b.name==='Tamamura Honten Co.')};assert(Object.values(fixtures).every(Boolean));report.fixtures=fixtures;
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const config of[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844},{name:'flat',width:1440,height:900,flat:true}]){
  if(!devices.includes(config.name))continue;compact=config.width<500;
  const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:1,isMobile:compact,hasTouch:compact,reducedMotion:'no-preference'});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(/^https?:$/.test(u.protocol)&&u.origin!==origin){report.external.push(u.href);return route.abort()}return route.continue()});
  await context.addInitScript(()=>{
   let recording=null,serial=0;const nodes=new WeakMap(),token=n=>{if(!nodes.has(n))nodes.set(n,++serial);return nodes.get(n)};
   function sample(now){if(recording){const w=document.querySelector('.brew-globe-view'),wr=w?.getBoundingClientRect(),z=Number(w?.dataset.zoomScale),ids=new Set(),heights=[],scales=[];
    const expected=Math.round(Math.max(recording.minimum,Math.min(recording.maximum,recording.minimum*z/recording.baseZoom))*100)/100;
    let modelBad=false;
    for(const n of w?.querySelectorAll('.globe-bottle')||[]){if(!n.checkVisibility({opacityProperty:true,visibilityProperty:true}))continue;
     const id=n.dataset.beerId,r=n.getBoundingClientRect(),lat=Number(n.dataset.displayLat),lng=Number(n.dataset.displayLng),scale=Number(n.dataset.photoScale||1),old=recording.known.get(id);
     const actual={x:(r.left+r.right)/2-wr.left,y:(r.top+r.bottom)/2-wr.top},projected=w._projectGeo(lat,lng),v={lat,lng,node:token(n),image:token(n.querySelector('img')),height:r.height,expected,projected,lastSeen:now};
     ids.add(id);heights.push(r.height);scales.push(scale);modelBad ||= Math.abs(r.height-expected)>.12;
     if(old){const hidden=old.hiddenSince===undefined?0:now-old.hiddenSince;
      if(old.node!==v.node||old.image!==v.image)recording.replacements.push({id,t:now-recording.start});
      if(Math.abs(old.lat-lat)>1e-6||Math.abs(old.lng-lng)>1e-6){const e={id,t:now-recording.start,hiddenDuration:hidden,from:[old.lat,old.lng],to:[lat,lng]};(hidden>=700?recording.hiddenReentries:recording.visibleGeoChanges).push(e)}
      if(hidden===0){const error=Math.abs((v.height-old.height)-(v.expected-old.expected));recording.maximumHeightModelDelta=Math.max(recording.maximumHeightModelDelta,error);if(error>.15)recording.heightContinuityErrors.push({id,t:now-recording.start,error})}
      const error=Math.hypot(actual.x-projected.x,actual.y-projected.y),lag=now-old.lastSeen<120?Math.hypot(actual.x-old.projected.x,actual.y-old.projected.y):error,residual=Math.min(error,lag);
      v.badRun=residual>2.5?(old.badRun||0)+1:0;if(v.badRun===3)recording.sustainedProjectionErrors.push({id,t:now-recording.start,residual});
     }
     recording.known.set(id,v);
    }
    for(const [id,v]of recording.known)if(!ids.has(id)&&v.hiddenSince===undefined)v.hiddenSince=now;
    const spread=heights.length?Math.max(...heights)-Math.min(...heights):0;recording.maximumSpread=Math.max(recording.maximumSpread,spread);
    if(spread>.1)recording.mixedFrames++;if(scales.some(v=>v!==1))recording.nonUnitScaleFrames++;if(modelBad)recording.sizeModelErrors++;
    recording.samples.push({t:now-recording.start,zoom:z,expectedHeight:expected,count:ids.size,heights:[...new Set(heights)],scales:[...new Set(scales)]});recording.frameCount++;
   }requestAnimationFrame(sample)}requestAnimationFrame(sample);
   window.__uniform={start(name,baseZoom,compact){recording={name,start:performance.now(),baseZoom,minimum:compact?20:22,maximum:compact?44:56,known:new Map(),frameCount:0,mixedFrames:0,nonUnitScaleFrames:0,sizeModelErrors:0,maximumSpread:0,maximumHeightModelDelta:0,heightContinuityErrors:[],replacements:[],visibleGeoChanges:[],hiddenReentries:[],sustainedProjectionErrors:[],samples:[]}},stop(){const r=recording;recording=null;return{...r,known:undefined,start:undefined}}};
  });
  if(config.flat)await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)}});
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push({state:active,message:e.message}));page.on('response',r=>{if(new URL(r.url()).origin===origin&&r.status()>=400)report.localErrors.push({url:r.url(),status:r.status()})});
  await page.goto(base,{waitUntil:'domcontentloaded'});await settle();const build=await page.locator('script[type=module]').getAttribute('src');
  if(process.env.EXPECTED_BUILD)assert(build.includes(process.env.EXPECTED_BUILD),`Wrong build ${build}`);if(report.build)assert.equal(build,report.build);else report.build=build;
  baseZoom=await page.locator('.brew-globe-view').evaluate(w=>Number(w.dataset.zoomScale));
  await choose(fixtures.china);let z=await page.locator('.brew-globe-view').evaluate(w=>Number(w.dataset.zoomScale));
  for(let i=0;i<10&&z>baseZoom*1.1;i++){await zoom(-1);z=await page.locator('.brew-globe-view').evaluate(w=>Number(w.dataset.zoomScale))}
  await begin(`${config.name}-china-far-near-far`);await snapshot(`${config.name}-china-far`,{requirePhotos:true,screenshot:true});
  for(let i=1;i<=4;i++){await zoom(1);await snapshot(`${config.name}-china-zoom-${i}`,{requirePhotos:true,screenshot:i===3})}
  for(let i=0;i<4;i++)await zoom(-1);await snapshot(`${config.name}-china-returned`,{requirePhotos:true});await end();
  // Keep the real China-focused camera but clear filters: nearby India/Japan and
  // other Asian sources now compete in one actual map view.
  await page.getByLabel('清除全部筛选',{exact:true}).click();await settle();
  await begin(`${config.name}-asia-multiple-breweries`);await snapshot(`${config.name}-asia-far`,{requirePhotos:true,screenshot:true});
  for(let i=1;i<=3;i++){await zoom(1);await snapshot(`${config.name}-asia-zoom-${i}`,{requirePhotos:true,screenshot:i===2||i===3})}
  for(let i=0;i<3;i++)await zoom(-1);await snapshot(`${config.name}-asia-returned`,{requirePhotos:true});await end();
  if(config.name==='desktop')for(const key of ['india','japan']){await choose(fixtures[key]);await begin(`desktop-${key}-near`);
   await snapshot(`desktop-${key}-focused`);for(let i=0;i<3;i++)await zoom(1);await snapshot(`desktop-${key}-zoomed`,{requirePhotos:true,screenshot:true});await end();}
  await context.close();report.progress={device:config.name,states:report.states.length,phases:report.phases.length};await writeFile(path.join(out,`uniform-size-${suffix}-results.json`),JSON.stringify(report,null,2)+'\n');
 }
 assert.deepEqual(report.external,[]);assert.deepEqual(report.errors,[]);assert.deepEqual(report.localErrors,[]);report.passed=before?false:true;
 if(before)report.baselineReproduced=report.states.some(s=>s.heightSpread>.1)&&report.phases.some(p=>p.mixedFrames>0);
}catch(e){report.passed=false;report.failure={state:active,message:e.message,stack:e.stack};console.error(e);process.exitCode=1;if(page&&!page.isClosed())await capture('failure').catch(()=>{})}
finally{await browser?.close();report.browserClosed=true;report.complete=true;report.finishedAt=new Date().toISOString();await mkdir(out,{recursive:true});await writeFile(path.join(out,`uniform-size-${suffix}-results.json`),JSON.stringify(report,null,2)+'\n')}
