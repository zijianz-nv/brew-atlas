import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasDescribedPhoto,hasBeerIntroduction} from '../src/beer-photo-eligibility.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'qa');
const runtime=createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`),{chromium}=runtime('playwright');
const base=process.env.DEMO_URL||'http://127.0.0.1:4173',origin=new URL(base).origin;
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname));
const report={startedAt:new Date().toISOString(),policy:'Isolated Chrome, local assets only. Real country/brewery filters and zoom buttons. Image size, land/collision geometry, decoded-node reuse, source detail checked. Photo counts may decrease because the user requested proportional image enlargement.',checks:[],states:[],screenshots:[],external:[],errors:[],localErrors:[],forbiddenImageRequests:[],eligibility:[]};
let browser,page,data,beerMap,forbiddenPaths,active='initialize';
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
async function settle(){if(await page.locator('.brew-globe-view').count())await page.waitForFunction(()=>document.querySelector('.brew-globe-view')?._landMask);await page.waitForTimeout(2200)}
async function capture(name){await page.mouse.move(0,0);const file=path.join(out,`zoom-image-${name}.png`);await page.screenshot({path:file});report.screenshots.push(file)}
async function state(name,{baseZoom,compact,requirePhotos=true}={}){
 await settle();
 const s=await page.evaluate(()=>{
  const w=document.querySelector('.brew-globe-view'),wr=w.getBoundingClientRect(),mask=w._landMask;
  const shown=n=>{const r=n.getBoundingClientRect();if(!r.width||!r.height)return false;for(let p=n;p;p=p.parentElement){const c=getComputedStyle(p);if(c.display==='none'||c.visibility==='hidden'||+c.opacity===0)return false}return true};
  const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
  const photos=[...w.querySelectorAll('.globe-bottle')].filter(shown).map(n=>{const r=rect(n),i=n.querySelector('img'),b={left:r.left-wr.left,right:r.right-wr.left,top:r.top-wr.top,bottom:r.bottom-wr.top};return{id:n.dataset.beerId,scale:Number(n.dataset.photoScale||1),rect:r,land:mask.containsRect(b),ready:n.dataset.imageState==='ready'&&i?.complete&&i.naturalWidth>0,src:i?.getAttribute('src'),fit:i&&getComputedStyle(i).objectFit,clickable:n.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))}});
  const obstacles=[...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.inspector,.brewery-tray,.compare-dock')].filter(shown).map(n=>({name:n.className,...rect(n)}));
  const badges=[...w.querySelectorAll('.globe-bottle-count,.globe-site-dot')].filter(shown).map(rect);
  return{allMapBeerIds:[...w.querySelectorAll('.globe-bottle')].map(n=>n.dataset.beerId),allImageSources:[...document.images].map(i=>i.getAttribute('src')),zoom:Number(w.dataset.zoomScale),mode:w.dataset.mapMode,photos,obstacles,badges,viewport:{width:innerWidth,height:innerHeight},wrapper:rect(w),cache:window.__zoomImage.audit()};
 });
 for(const id of s.allMapBeerIds)assert(hasDescribedPhoto(beerMap.get(id)),`${name}: image DOM exists for an undescribed beer ${id}`);
 for(const src of s.allImageSources)if(src)assert(!forbiddenPaths.has(new URL(src,base).pathname),`${name}: ineligible image exists in DOM`);
 const initial=compact?20:22,maximum=compact?44:56;
 const expected=baseZoom?Math.round(Math.max(initial,Math.min(maximum,initial*s.zoom/baseZoom))*100)/100:initial;
 report.states.push({name,...s,baseZoom,expectedHeight:expected,visiblePhotos:s.photos.length});
 if(requirePhotos)assert(s.photos.length>0,`${name}: no local photograph in this inland fixture`);
 for(const p of s.photos){
  const expectedPhotoHeight=Math.round(Math.max(14,expected*p.scale)*100)/100;
  assert(Math.abs(p.rect.height-expectedPhotoHeight)<.1,`${name}: photo height ${p.rect.height} does not follow map zoom and local scale (${expectedPhotoHeight})`);
  assert(Math.abs(p.rect.width-p.rect.height*.52)<.03,'Photo frame aspect ratio changed');
  assert(p.land,`${name}: photo crosses land`);assert(p.ready,`${name}: local image not decoded`);assert.equal(p.fit,'contain');
  const beer=beerMap.get(p.id);assert(beer);assert.equal(p.src,beer.imageThumbnail||beer.image);assert(p.src.startsWith('/'));
  assert(p.rect.left>=Math.max(0,s.wrapper.left)-.5&&p.rect.right<=Math.min(s.viewport.width,s.wrapper.right)+.5&&p.rect.top>=Math.max(0,s.wrapper.top)-.5&&p.rect.bottom<=Math.min(s.viewport.height,s.wrapper.bottom)+.5,'Photo leaves viewport');
  for(const o of [...s.obstacles,...s.badges])assert(overlap(p.rect,o)<=1,`${name}: photo overlaps an interface control`);
 }
 for(let i=0;i<s.photos.length;i++)for(let j=0;j<i;j++)assert(overlap(s.photos[i].rect,s.photos[j].rect)<=1,`${name}: enlarged photos overlap`);
 assert.equal(s.cache.replacements,0,'A previously seen beer photo DOM node was replaced');assert.equal(s.cache.readyToLoading,0,'A decoded photo re-entered loading');
 return s;
}
async function choose(br){
 await page.getByRole('button',{name:'酒厂与地区',exact:true}).click();
 await page.getByLabel('按国家或地区筛选',{exact:true}).selectOption(br.country);
 await page.getByLabel('按酒厂筛选',{exact:true}).selectOption(br.id);
 await page.getByRole('button',{name:'收起筛选',exact:true}).click();await settle();
}
async function check(name,fn){active=name;await fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`)}
try{
 await mkdir(out,{recursive:true});data=await (await fetch(`${base}/data/beertasting.json`)).json();beerMap=new Map(data.beers.map(b=>[b.id,b]));report.data={beers:data.beers.length,cachedImages:data.beers.filter(b=>b.image).length,eligibleImages:data.beers.filter(hasDescribedPhoto).length,breweries:data.breweries.length};
 const eligiblePaths=new Set(data.beers.filter(hasDescribedPhoto).flatMap(b=>[b.image,b.imageThumbnail,b.imageOriginal].filter(Boolean)));
 forbiddenPaths=new Set(data.beers.filter(b=>b.image&&!hasDescribedPhoto(b)).flatMap(b=>[b.image,b.imageThumbnail,b.imageOriginal].filter(Boolean)).filter(p=>!eligiblePaths.has(p)));
 const eligibleBreweries=data.breweries.filter(br=>data.beers.some(b=>b.breweryId===br.id&&hasDescribedPhoto(b)));
 const fixture=eligibleBreweries.find(b=>/Master Gao/.test(b.name))||eligibleBreweries.find(b=>/Toit/.test(b.name));assert(fixture,'Real inland brewery with described photos required');
 const missing=data.beers.find(b=>b.image&&!hasBeerIntroduction(b)&&data.beers.filter(x=>x.name.trim()===b.name.trim()).length===1);
 report.fixture={brewery:fixture.name,undescribedBeerId:missing?.id,undescribedName:missing?.name};
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const config of[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844},{name:'flat',width:1440,height:900,flat:true}]){
  const compact=config.width<500,ctx=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:1,isMobile:compact,hasTouch:compact,reducedMotion:'reduce'});
  await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(/^https?:$/.test(u.protocol)&&u.origin!==origin){report.external.push(u.href);return r.abort()}return r.continue()});
  await ctx.addInitScript(()=>{
   const known=new Map();let replacements=0,readyToLoading=0;
   const inspect=n=>{const id=n.dataset.beerId;if(!id)return;const img=n.querySelector('img'),old=known.get(id);if(old){if(old.node!==n||old.image&&img&&old.image!==img)replacements++;if(old.ready&&n.dataset.imageState==='loading')readyToLoading++}known.set(id,{node:n,image:img||old?.image,ready:old?.ready||n.dataset.imageState==='ready'})};
   const observer=new MutationObserver(records=>{for(const m of records){if(m.type==='attributes'){if(m.target.matches('.globe-bottle'))inspect(m.target);continue}for(const n of m.addedNodes){if(n.nodeType!==1)continue;if(n.matches('.globe-bottle'))inspect(n);for(const p of n.querySelectorAll('.globe-bottle'))inspect(p)}}});observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-image-state']});window.__zoomImage={audit:()=>{for(const n of document.querySelectorAll('.globe-bottle'))inspect(n);return{replacements,readyToLoading,known:known.size}}};
  });
  if(config.flat)await ctx.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)}});
  page=await ctx.newPage();page.setDefaultTimeout(18000);page.on('request',r=>{const u=new URL(r.url());if(u.origin===origin&&forbiddenPaths.has(u.pathname))report.forbiddenImageRequests.push({case:active,url:u.href})});page.on('pageerror',e=>report.errors.push({case:active,message:e.message}));page.on('response',r=>{if(new URL(r.url()).origin===origin&&r.status()>=400)report.localErrors.push({url:r.url(),status:r.status()})});
  await page.goto(`${base}/?collection=beertasting`,{waitUntil:'domcontentloaded'});await settle();report.build=await page.locator('script[type=module]').getAttribute('src');
  const baseZoom=await page.locator('.brew-globe-view').evaluate(w=>Number(w.dataset.zoomScale));
  await check(`${config.name}: overview retains original compact footprint`,async()=>{const s=await state(`${config.name}-home`,{compact,baseZoom});assert.equal(s.mode,config.flat?'flat':'globe');await capture(`${config.name}-home`)});
  await choose(fixture);
  // Return the selected inland point near the overview scale with actual buttons.
  let z=await page.locator('.brew-globe-view').evaluate(w=>Number(w.dataset.zoomScale)),downs=0;
  while(z>baseZoom*1.1&&downs++<10){await page.getByLabel('缩小地球',{exact:true}).click();await settle();z=await page.locator('.brew-globe-view').evaluate(w=>Number(w.dataset.zoomScale))}
  await check(`${config.name}: pictures grow with map zoom, cap safely, and preserve decoded nodes`,async()=>{
   const start=await state(`${config.name}-selected-far`,{compact,baseZoom});const heights=[start.photos[0].rect.height];await capture(`${config.name}-selected-far`);
   for(let i=1;i<=4;i++){await page.getByLabel('放大地球',{exact:true}).click();const s=await state(`${config.name}-zoom-${i}`,{compact,baseZoom});heights.push(s.photos[0].rect.height);if(i===2||i===4)await capture(`${config.name}-zoom-${i}`)}
   assert(heights[1]>heights[0],'First zoom must enlarge the actual image');assert(heights[2]>heights[1],'Second zoom must enlarge the actual image');assert(Math.abs(heights.at(-1)-(compact?44:56))<.1,'Near view must reach the bounded readable size');
   await state(`${config.name}-near`,{compact,baseZoom});
   for(let i=1;i<=4;i++){await page.getByLabel('缩小地球',{exact:true}).click();await settle()}
   const returned=await state(`${config.name}-zoom-return`,{compact,baseZoom});assert(Math.abs(returned.photos[0].rect.height-heights[0])<.1,'Zooming out restores the original picture footprint');
   const target=returned.photos.find(p=>p.clickable);assert(target);await page.mouse.click((target.rect.left+target.rect.right)/2,(target.rect.top+target.rect.bottom)/2);await page.locator('.inspector h2').waitFor();assert.equal((await page.locator('.inspector h2').innerText()).trim(),beerMap.get(target.id).name.trim());await page.waitForFunction(()=>{const i=document.querySelector('.inspector-hero .beer-photo img');return i?.complete&&i.naturalWidth>0});assert.equal(await page.locator('.inspector-hero .beer-photo img').getAttribute('src'),beerMap.get(target.id).imageOriginal||beerMap.get(target.id).image);await page.getByLabel('关闭酒款详情',{exact:true}).click();
  });
  await check(`${config.name}: cached but undescribed beer retains library/detail without image DOM or requests`,async()=>{
   if(!missing){report.eligibility.push({device:config.name,exercised:false,reason:'No real cached-image/no-introduction record in this build; all image-request and DOM eligibility checks still ran.'});return;}
   await page.getByRole('button',{name:'酒库',exact:true}).click();await page.getByLabel('搜索酒款酒厂或国家',{exact:true}).fill(missing.name.trim());await settle();
   const card=page.getByRole('button',{name:`查看 ${missing.name.trim()}`,exact:true});await card.waitFor();assert.equal(await card.locator('img').count(),0,'Undescribed library card contains an image');await card.click();await page.locator('.inspector h2').waitFor();assert.equal((await page.locator('.inspector h2').innerText()).trim(),missing.name.trim());assert.equal(await page.locator('.inspector-hero img').count(),0,'Undescribed detail fetched an original picture');
   report.eligibility.push({device:config.name,beerId:missing.id,sourceId:missing.sourceRecord?.id,cardImages:0,heroImages:0});
   const sources=await page.locator('img').evaluateAll(nodes=>nodes.map(i=>i.getAttribute('src')));for(const src of sources)if(src)assert(!forbiddenPaths.has(new URL(src,base).pathname),'Hidden source image leaked into another detail area');
  });
  await ctx.close();
 }
 await check('No external requests or browser/local-asset errors',async()=>{assert.deepEqual(report.external,[]);assert.deepEqual(report.errors,[]);assert.deepEqual(report.localErrors,[]);assert.deepEqual(report.forbiddenImageRequests,[])});report.passed=true;
}catch(e){report.passed=false;report.failure={case:active,message:e.message,stack:e.stack};console.error(e);if(page&&!page.isClosed())await capture('failure').catch(()=>{});process.exitCode=1}
finally{await browser?.close();report.browserClosed=true;report.finishedAt=new Date().toISOString();await mkdir(out,{recursive:true});await writeFile(path.join(out,'zoom-image-results.json'),JSON.stringify(report,null,2)+'\n')}
