import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {classifyBeer} from '../src/beer-taxonomy.mjs';

// Acceptance contract: real photos may fan around an unchanged source coordinate.
// This replaces the v1.4 assertion that every image center must equal its anchor.
let playwright;
try{playwright=await import('playwright');}catch{playwright=createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright');}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.DEMO_URL||'http://127.0.0.1:4173',origin=new URL(base).origin;
const output=path.join(root,'qa');await mkdir(output,{recursive:true});
const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[],measurements=[],errors=[],external=[],source={},beers=[],beerById=new Map(),breweryById=new Map(),taxonomy=new Map();
const located=b=>b&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180;
const markerSelector='.brew-globe-view [data-marker-id]';
let page,activeCase='initialization',appAssets=[];

async function newPage(device,flat=false){
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:1,isMobile:device.width<500,hasTouch:device.width<=1024,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){external.push(url.href);return route.abort();}return route.continue();});
  const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',error=>errors.push({case:activeCase,message:error.message}));
  if(flat)await p.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
  await p.goto(base);await p.getByLabel('选择数据集').waitFor();return p;
}
async function settle(p=page){await p.locator(`${markerSelector} .globe-bottle:visible`).first().waitFor();await p.mouse.move(0,0);await p.waitForTimeout(650);}
async function screenshot(name,p=page){await p.mouse.move(0,0);await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.height&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;}).map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));});await p.screenshot({path:path.join(output,`${name}.png`),animations:'disabled'});}
async function closeDetails(p=page){if(await p.locator('.inspector').count())await p.getByLabel('关闭酒款详情',{exact:true}).click();await p.mouse.move(0,0);}
async function check(name,fn){activeCase=name;await fn();results.push({name,passed:true});console.log(`PASS ${name}`);}
async function visibleClick(selector,p=page){
  for(let attempt=0;attempt<8;attempt++){
    const candidate=await p.locator(selector).evaluateAll(nodes=>nodes.map((node,index)=>{const r=node.getBoundingClientRect(),points=[[.5,.5],[.25,.4],[.75,.4],[.5,.2],[.5,.8]];const hit=points.map(([fx,fy])=>({x:r.x+r.width*fx,y:r.y+r.height*fy})).find(({x,y})=>r.width&&r.height&&x>2&&x<innerWidth-2&&y>2&&y<innerHeight-2&&node.contains(document.elementFromPoint(x,y)));return hit?{index,...hit,beerId:node.dataset.beerId,markerId:node.closest('[data-marker-id]')?.dataset.markerId}:null;}).find(Boolean));
    if(candidate){await p.mouse.click(candidate.x,candidate.y);return candidate;}await p.waitForTimeout(150);
  }throw Error(`No exposed target: ${selector}`);
}
async function state(p=page){return p.evaluate(()=>{
  const wrapper=document.querySelector('.brew-globe-view'),bounds=wrapper.getBoundingClientRect(),number=v=>v==null||v===''?null:Number(v),rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
  const visible=node=>{const s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;};
  const markers=[...wrapper.querySelectorAll('[data-marker-id]')].filter(visible).map(node=>({id:node.dataset.markerId,anchorId:node.dataset.anchorId,cluster:node.dataset.cluster,memberIds:JSON.parse(node.dataset.memberIds||'[]'),memberCount:number(node.dataset.memberCount),beerCount:number(node.dataset.beerCount),photoCount:number(node.dataset.photoCount),expanded:node.dataset.expanded,lat:number(node.dataset.anchorLat),lng:number(node.dataset.anchorLng),screenX:number(node.dataset.screenX),screenY:number(node.dataset.screenY),badge:node.querySelector('.globe-bottle-count')?.textContent,photos:[...node.querySelectorAll('.globe-bottle')].filter(visible).map(button=>{const image=button.querySelector('img'),r=image?.getBoundingClientRect();return {id:button.dataset.beerId,breweryId:button.dataset.sourceBreweryId,lat:number(button.dataset.sourceLat),lng:number(button.dataset.sourceLng),sourceX:number(button.dataset.sourceScreenX),sourceY:number(button.dataset.sourceScreenY),offsetX:number(button.dataset.displayOffsetX),offsetY:number(button.dataset.displayOffsetY),src:image?.getAttribute('src'),decoded:!!image?.complete&&image.naturalWidth>0,rect:r?rect(r):null};})}));
  return {mode:wrapper.dataset.mapMode||(wrapper.querySelector('.globe-flat-map')?'flat':'globe'),zoom:number(wrapper.dataset.zoomScale),viewport:[innerWidth,innerHeight],wrapper:rect(bounds),markers,connectors:wrapper.querySelectorAll('.globe-bottle-marker svg,.globe-bottle-marker line,.globe-bottle-marker path,.globe-marker-leader').length};
});}
async function inspectFans(name,collection='pictured',p=page){
  assert.deepEqual(await p.locator('.brew-globe-view .globe-bottle img').evaluateAll(async images=>(await Promise.all(images.map(async i=>{try{await i.decode();return null;}catch{return i.getAttribute('src');}}))).filter(Boolean)),[],`${name}: displayed image decode`);
  const view=await state(p),active=collection==='pictured'?beers.filter(b=>b.image):collection==='all'?beers:source[collection].beers;
  const counts=new Map();for(const b of active)counts.set(b.breweryId,(counts.get(b.breweryId)||0)+1);
  const photos=[],represented=new Set(),seenBeers=new Set();let maxDisplacementError=0,maxOverlapFraction=0;
  assert(view.markers.length>0&&view.markers.some(m=>m.photos.length),`${name}: pictured map is empty`);assert.equal(view.connectors,0,`${name}: geographic leader line remains`);
  for(const marker of view.markers){
    assert(marker.memberIds.length>0);assert.equal(marker.memberCount,marker.memberIds.length);assert.equal(marker.cluster==='true',marker.memberIds.length>1);
    assert(marker.memberIds.some(id=>{const b=breweryById.get(id);return b&&Math.abs(b.lat-marker.lat)<1e-5&&Math.abs(b.lng-marker.lng)<1e-5;}),`${name}: invented group anchor`);
    for(const id of marker.memberIds){assert(located(breweryById.get(id)),`${name}: unverified map location ${id}`);assert(!represented.has(id),`${name}: duplicated visible location ${id}`);represented.add(id);}
    assert.equal(marker.beerCount,marker.memberIds.reduce((total,id)=>total+(counts.get(id)||0),0),`${name}: badge count must represent actual library records`);
    assert.equal(marker.photoCount,marker.photos.length,`${name}: rendered photo count disagrees with contract`);
    for(const photo of marker.photos){
      const beer=beerById.get(photo.id),br=beer&&breweryById.get(beer.breweryId);assert(beer&&beer.image&&located(br));assert.equal(photo.src,beer.image);assert.equal(photo.breweryId,beer.breweryId);assert(marker.memberIds.includes(beer.breweryId));assert(!seenBeers.has(photo.id),`${name}: duplicated representative beer`);seenBeers.add(photo.id);
      assert.equal(photo.lat,br.lat);assert.equal(photo.lng,br.lng);assert(photo.decoded&&photo.rect);assert(photo.rect.width>=12&&photo.rect.height>=12);
      const error=Math.hypot(photo.rect.left+photo.rect.width/2-view.wrapper.left-photo.sourceX-photo.offsetX,photo.rect.top+photo.rect.height/2-view.wrapper.top-photo.sourceY-photo.offsetY);assert(Number.isFinite(error)&&error<=2.3,`${name}: displayed photo disagrees with source and declared offset (${error}px)`);maxDisplacementError=Math.max(maxDisplacementError,error);
      assert(photo.rect.left>=Math.max(0,view.wrapper.left)-1&&photo.rect.right<=Math.min(view.viewport[0],view.wrapper.right)+1&&photo.rect.top>=Math.max(0,view.wrapper.top)-1&&photo.rect.bottom<=Math.min(view.viewport[1],view.wrapper.bottom)+1,`${name}: photo clipped by map boundary`);
      photos.push({...photo,markerId:marker.id});
    }
  }
  for(let i=0;i<photos.length;i++)for(let j=i+1;j<photos.length;j++){const a=photos[i],b=photos[j],area=Math.max(0,Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left))*Math.max(0,Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)),fraction=area/Math.min(a.rect.width*a.rect.height,b.rect.width*b.rect.height);maxOverlapFraction=Math.max(maxOverlapFraction,fraction);assert(fraction<=(a.markerId===b.markerId ? .30 : .03),`${name}: images ${a.id}/${b.id} overlap ${(fraction*100).toFixed(1)}%`);}
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: horizontal page overflow`);
  measurements.push({name,mode:view.mode,viewport:view.viewport,zoom:view.zoom,visiblePhotos:photos.length,maxFanPhotos:Math.max(...view.markers.map(m=>m.photos.length)),representedBreweries:represented.size,maxDisplacementError,maxOverlapFraction,markers:view.markers});return view;
}
async function waitCount(expected,p=page){await p.waitForFunction(n=>Number(document.querySelector('.library-heading>span')?.textContent.match(/[\d,]+/)?.[0]?.replaceAll(',',''))===n&&document.querySelectorAll('.beer-card').length===Math.min(60,n),expected);}
async function controlsFit(p=page){const clipped=await p.locator('.facet-tabs button,.dock-main input,.dock-main select,.dock-main>button').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&(r.left<-.5||r.right>innerWidth+.5||r.top<-.5||r.bottom>innerHeight+.5);}).map(n=>({label:n.getAttribute('aria-label')||n.textContent,rect:n.getBoundingClientRect().toJSON()})));assert.deepEqual(clipped,[],'Bottom navigation and primary controls must fit their viewport');}
async function reset(p=page){const button=p.getByLabel('清除全部筛选',{exact:true});if(await button.count()&&await button.isEnabled())await button.click();}
async function panel(name,p=page){const button=p.getByRole('button',{name,exact:true});if(await button.getAttribute('aria-expanded')!=='true')await button.click();}
const idsInFamily=(pool,family)=>pool.filter(b=>taxonomy.get(b.id).family===family);
const facetMatches=(beer,dimension,value)=>value==='unknown'?taxonomy.get(beer.id)[dimension].length===0:taxonomy.get(beer.id)[dimension].includes(value);
async function assertChipCounts(dimension,pool,p=page){const chips=await p.locator(`[data-facet="${dimension}"][data-value]`).evaluateAll(nodes=>nodes.map(n=>({value:n.dataset.value,count:Number(n.dataset.count),disabled:n.disabled})));assert(chips.length>1,`${dimension}: facet chips missing`);for(const chip of chips){if(!chip.value||chip.value==='all')continue;const expected=pool.filter(b=>facetMatches(b,dimension,chip.value)).length;assert.equal(chip.count,expected,`${dimension}/${chip.value}: context-sensitive facet count`);if(!expected)assert(chip.disabled,`${dimension}/${chip.value}: impossible combination should be disabled`);}}

try{
  for(const key of ['off','world','archive','openbeer']){const response=await fetch(`${base}/data/${key}.json`);assert(response.ok);source[key]=await response.json();for(const b of source[key].beers){beers.push(b);beerById.set(b.id,b);taxonomy.set(b.id,classifyBeer(b));}for(const b of source[key].breweries)breweryById.set(b.id,b);}
  const pictured=beers.filter(b=>b.image);
  page=await newPage({width:1440,height:900});
  appAssets=await page.locator('script[type="module"][src]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src')));
  await check('Desktop globe shows distinct real photos in density fans without leader lines',async()=>{await settle();assert.equal(await page.getByLabel('选择数据集').inputValue(),'pictured');const view=await inspectFans('desktop-global');assert.equal(view.mode,'globe');assert(view.markers.some(m=>m.photos.length>=3),'Dense global area should reveal multiple pictures');await screenshot('v15-desktop');});
  await check('Dense count badge expands geographically while each photo opens its own stable detail',async()=>{
    const before=await state(),dense=before.markers.filter(m=>m.cluster==='true'&&m.photos.length>1).sort((a,b)=>b.memberCount-a.memberCount)[0];assert(dense,'Need a dense regional fan');
    await visibleClick(`${markerSelector}[data-marker-id=${JSON.stringify(dense.id)}] .globe-bottle-count`);await settle();assert.equal(await page.locator('.inspector').count(),0,'Count badge must not open an arbitrary beer');
    const after=await inspectFans('desktop-expanded');assert(after.zoom>before.zoom||await page.locator('.globe-cluster-picker').count(),'Badge must zoom or expose actual location choices');await screenshot('v15-denseexpanded');
    if(await page.locator('.globe-cluster-picker').count()){await page.keyboard.press('Escape');}
    const target=await visibleClick(`${markerSelector} .globe-bottle`);await page.locator('.inspector h2').waitFor();await page.waitForTimeout(650);assert.equal(await page.locator('.inspector h2').innerText(),beerById.get(target.beerId).name);assert.equal(await page.locator('.brewery-tray').count(),0);await closeDetails();
  });
  await check('Species and child style counts use source classification, and filters reset pagination',async()=>{
    await page.getByRole('button',{name:'酒库',exact:true}).click();await waitCount(pictured.length);await page.getByLabel('下一页',{exact:true}).click();assert.match(await page.locator('.page-position').innerText(),/^61/);
    await page.locator('[data-facet="family"][data-value="ipa"]').click();const ipa=idsInFamily(pictured,'ipa');assert(ipa.length>0);await waitCount(ipa.length);assert.match(await page.locator('.page-position').innerText(),/^1–/);
    await panel('种类');const options=await page.getByLabel('按子风格筛选',{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,text:n.textContent,disabled:n.disabled})));const option=options.find(o=>!['','all','unknown'].includes(o.value)&&!o.disabled);assert(option,'IPA should have at least one source child style');
    await page.getByLabel('按子风格筛选',{exact:true}).selectOption(option.value);const sub=ipa.filter(b=>taxonomy.get(b.id).substyle?.id===option.value);await waitCount(sub.length);assert.deepEqual(await page.locator('.beer-card h3').allTextContents(),sub.slice(0,60).map(b=>b.name));await screenshot('v15-taxonomy');
    await reset();await waitCount(pictured.length);
  });
  await check('Taste, mouthfeel and aroma are independent, with contextual counts and honest unknowns',async()=>{
    await page.locator('[data-facet="family"][data-value="ipa"]').click();const ipa=idsInFamily(pictured,'ipa');await waitCount(ipa.length);await panel('口味与口感');await assertChipCounts('taste',ipa);await assertChipCounts('mouthfeel',ipa);
    const taste=await page.locator('[data-facet="taste"][data-value]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.value,count:Number(n.dataset.count)})).find(n=>n.id&&!['all','unknown'].includes(n.id)&&n.count>0));assert(taste,'IPA source taste fixture missing');await page.locator(`[data-facet="taste"][data-value="${taste.id}"]`).click();const tasted=ipa.filter(b=>facetMatches(b,'taste',taste.id));await waitCount(tasted.length);await panel('风味');await assertChipCounts('aroma',tasted);await screenshot('v15-facets');
    await reset();await page.getByLabel('选择数据集').selectOption('off');await waitCount(source.off.beers.length);await panel('风味');assert(source.off.beers.every(b=>taxonomy.get(b.id).aroma.length===0),'OFF community tags must not invent tasting notes');await page.locator('[data-facet="aroma"][data-value="unknown"]').click();await waitCount(source.off.beers.length);await reset();
  });
  await check('Recipe process evidence filters actual records and source detail, saved state survives navigation',async()=>{
    await page.getByLabel('选择数据集').selectOption('archive');await waitCount(source.archive.beers.length);await panel('更多筛选');await page.getByLabel('按制作工艺筛选',{exact:true}).selectOption('dry-hop');const dry=source.archive.beers.filter(b=>facetMatches(b,'process','dry-hop'));assert(dry.some(b=>b.id==='archive-002'),'Punk IPA 2010 recipe dry-hop fixture must be represented');await waitCount(dry.length);
    assert.deepEqual(await page.locator('.beer-card h3').allTextContents(),dry.slice(0,60).map(b=>b.name));await page.locator('.beer-card-main').first().click();await page.locator('.taxonomy-detail [data-dimension="process"]').waitFor();assert.match(await page.locator('.taxonomy-detail [data-dimension="process"]').innerText(),/干投/);assert(await page.locator('.taxonomy-evidence').count());await page.locator('.taxonomy-detail [data-dimension="process"]').scrollIntoViewIfNeeded();await screenshot('v15-detail');await closeDetails();
    const first=dry[0];await page.getByLabel(`收藏 ${first.name}`,{exact:true}).click();await page.getByRole('button',{name:'想尝',exact:true}).click();await waitCount(1);assert.equal(await page.locator('.beer-card h3').innerText(),first.name);await page.getByRole('button',{name:'酒库',exact:true}).click();await reset();await page.getByLabel('选择数据集').selectOption('pictured');await waitCount(pictured.length);
  });
  await check('Country and brewery filters compose and changing country releases the previous brewery',async()=>{
    await page.getByLabel('选择数据集').selectOption('world');await waitCount(source.world.beers.length);await panel('酒厂与地区');
    const countryIds=[...new Set(source.world.beers.map(b=>breweryById.get(b.breweryId)?.country).filter(Boolean))];assert(countryIds.length>1);const firstCountry=countryIds[0],secondCountry=countryIds[1];
    await page.getByLabel('按国家或地区筛选',{exact:true}).selectOption(firstCountry);const regional=source.world.beers.filter(b=>breweryById.get(b.breweryId)?.country===firstCountry);await waitCount(regional.length);
    const breweryId=regional[0].breweryId;await page.getByLabel('按酒厂筛选',{exact:true}).selectOption(breweryId);await waitCount(regional.filter(b=>b.breweryId===breweryId).length);
    await page.getByLabel('按国家或地区筛选',{exact:true}).selectOption(secondCountry);assert.equal(await page.getByLabel('按酒厂筛选',{exact:true}).inputValue(),'all');const other=source.world.beers.filter(b=>breweryById.get(b.breweryId)?.country===secondCountry);await waitCount(other.length);assert.deepEqual(await page.locator('.beer-card h3').allTextContents(),other.map(b=>b.name));
    await page.getByLabel('选择数据集').selectOption('pictured');await waitCount(pictured.length);
  });
  for(const device of [{name:'tablet',width:1024,height:768},{name:'mobile',width:390,height:844}]){
    await page.context().close();page=await newPage(device);
    await check(`${device.name}: progressive map photos and bottom classification controls fit the screen`,async()=>{await settle();const view=await inspectFans(`${device.name}-global`);assert(view.markers.some(m=>m.photos.length>1),`${device.name}: density vanished into one representative`);await controlsFit();await screenshot(`v15-${device.name}`);await page.getByRole('button',{name:'酒库',exact:true}).click();await panel('种类');await page.getByLabel('按种类筛选',{exact:true}).selectOption('ipa');await waitCount(idsInFamily(pictured,'ipa').length);await panel('口味与口感');await assertChipCounts('taste',idsInFamily(pictured,'ipa'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await controlsFit();await screenshot(`v15-${device.name}-filters`);});
  }
  await page.context().close();page=await newPage({width:390,height:844},true);
  await check('Phone flat fallback preserves geographic provenance, multi-photo fans and direct detail selection',async()=>{await page.getByRole('img',{name:'世界精酿酒厂平面地图',exact:true}).waitFor();await settle();const view=await inspectFans('mobile-flat');assert.equal(view.mode,'flat');assert(view.markers.some(m=>m.photos.length>1));const target=await visibleClick(`${markerSelector} .globe-bottle`);await page.locator('.inspector h2').waitFor();await page.waitForTimeout(650);assert.equal(await page.locator('.inspector h2').innerText(),beerById.get(target.beerId).name);assert.equal(await page.locator('.brewery-tray').count(),0);await closeDetails();await screenshot('v15-mobile-fallback');});
  assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(external,[],'Demo must not require external images or assets');
}catch(error){results.push({name:activeCase,passed:false,error:error.stack});process.exitCode=1;console.error(error);try{await page?.screenshot({path:path.join(output,'v15-failure.png')});}catch{}}
finally{await writeFile(path.join(output,'v15-results.json'),JSON.stringify({testedAt:new Date().toISOString(),base,browser:await browser.version(),appAssets,sourceCounts:Object.fromEntries(Object.entries(source).map(([key,data])=>[key,data.beers.length])),thresholds:{maxPhotoProjectionErrorPixels:2.3,maxWithinFanPairwiseOverlap:.30,maxAcrossFanPairwiseOverlap:.03},results,measurements,errors,external},null,2));await browser.close();}
