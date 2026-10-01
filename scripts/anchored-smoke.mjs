import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Browser contract: marker data-screen-x/y are actual geographic projection
// coordinates relative to .brew-globe-view, never displaced layout positions.
// data-member-ids is the JSON array of original brewery IDs in that marker.
// data-zoom-scale increases when zooming in, for both projection modes.
let playwright;
try{playwright=await import('playwright');}catch{playwright=createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright');}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.DEMO_URL||'http://127.0.0.1:4173',origin=new URL(base).origin;
const output=path.join(root,'qa');await mkdir(output,{recursive:true});
const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[],measurements=[],errors=[],external=[];
const source={},beerById=new Map(),breweryById=new Map();
let page,activeCase='initialization';
const markerSelector='.brew-globe-view [data-marker-id]';
const singlePhoto=`${markerSelector} .globe-bottle[data-cluster="false"]`;
const clusterPhoto=`${markerSelector} .globe-bottle[data-cluster="true"]`;
const number=value=>value==null||value===''?null:Number(value);
const located=b=>b&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180;

async function settle(p=page){
  await p.getByLabel('选择数据集').waitFor();
  await p.waitForFunction(()=>document.querySelector('.brew-globe-view [data-marker-id]'));
  await p.mouse.move(0,0);await p.waitForTimeout(650);
}
async function choose(collection,p=page){await p.getByLabel('选择数据集').selectOption(collection);await settle(p);}
async function closeDetails(p=page){if(await p.locator('.inspector').count())await p.getByLabel('关闭酒款详情',{exact:true}).click();await p.mouse.move(0,0);}
async function screenState(p=page){
  return p.evaluate(()=>{
    const wrapper=document.querySelector('.brew-globe-view'),bounds=wrapper.getBoundingClientRect();
    const numeric=value=>value==null||value===''?null:Number(value);
    const rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
    const visible=node=>{const style=getComputedStyle(node),r=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&r.right>Math.max(0,bounds.left)&&r.left<Math.min(innerWidth,bounds.right)&&r.bottom>Math.max(0,bounds.top)&&r.top<Math.min(innerHeight,bounds.bottom);};
    const markers=[...wrapper.querySelectorAll('[data-marker-id]')].filter(visible).map(node=>{
      const image=node.querySelector('.globe-bottle img'),button=node.querySelector('.globe-bottle');
      const imageRect=image?.getBoundingClientRect(),center=imageRect?{x:imageRect.x+imageRect.width/2,y:imageRect.y+imageRect.height/2}:null;
      const memberIds=node.dataset.memberIds?JSON.parse(node.dataset.memberIds):[];
      return {
        id:node.dataset.markerId,cluster:node.dataset.cluster,breweryId:node.dataset.breweryId,
        anchorLat:numeric(node.dataset.anchorLat),anchorLng:numeric(node.dataset.anchorLng),
        screenX:numeric(node.dataset.screenX),screenY:numeric(node.dataset.screenY),
        memberIds,memberCount:numeric(node.dataset.memberCount),beerCount:numeric(node.dataset.beerCount),
        photoCount:node.querySelectorAll('.globe-bottle img').length,beerId:button?.dataset.beerId,
        src:image?.getAttribute('src'),decoded:image?image.complete&&image.naturalWidth>0&&image.naturalHeight>0:null,
        rect:imageRect?rect(imageRect):null,center,exposed:center?node.contains(document.elementFromPoint(center.x,center.y)):null,
        badge:node.querySelector('.globe-bottle-count,.globe-site-dot')?.getAttribute('aria-label'),
      };
    });
    const mapMode=wrapper.dataset.mapMode||(wrapper.querySelector('.globe-flat-map')?'flat':'globe');
    return {mode:mapMode,zoom:numeric(wrapper.dataset.zoomScale),width:innerWidth,height:innerHeight,wrapper:rect(bounds),
      totalMarkerNodes:wrapper.querySelectorAll('[data-marker-id]').length,connectors:wrapper.querySelectorAll('.globe-bottle-marker svg,.globe-bottle-marker line,.globe-bottle-marker path').length,
      markers,viewBox:wrapper.querySelector('.globe-flat-map>svg')?.getAttribute('viewBox')};
  });
}

async function inspectAnchors(name,collection,p=page){
  await p.mouse.move(0,0);
  const broken=await p.locator('.brew-globe-view .globe-bottle img').evaluateAll(async images=>{
    const failures=[];await Promise.all(images.map(async image=>{try{await image.decode();}catch{failures.push(image.getAttribute('src'));}}));return failures;
  });assert.deepEqual(broken,[],`${name}: displayed image decode`);
  const state=await screenState(p),photos=state.markers.filter(marker=>marker.rect);
  assert.equal(state.connectors,0,`${name}: leader lines must be removed`);
  assert(photos.length>0,`${name}: map has no real photographs`);

  assert(Number.isFinite(state.zoom)&&state.zoom>0,`${name}: missing actual zoom metric`);
  const activeBeers=collection==='pictured'?[...beerById.values()].filter(beer=>beer.image):collection==='all'?[...beerById.values()]:source[collection].beers;
  const beerCounts=new Map();for(const beer of activeBeers)beerCounts.set(beer.breweryId,(beerCounts.get(beer.breweryId)||0)+1);
  const eligibleIds=new Set(activeBeers.filter(beer=>located(breweryById.get(beer.breweryId))).map(beer=>beer.breweryId));
  assert(state.totalMarkerNodes<=eligibleIds.size,`${name}: more markers than actual mapped sites`);
  const represented=new Set();let maxAnchorError=0;
  for(const marker of state.markers){
    assert(['true','false'].includes(marker.cluster),`${name}/${marker.id}: cluster type missing`);
    for(const key of ['anchorLat','anchorLng','screenX','screenY'])assert(Number.isFinite(marker[key]),`${name}/${marker.id}: ${key} missing`);
    assert(marker.memberIds.length>0,`${name}/${marker.id}: actual member identities missing`);
    assert.equal(marker.memberCount,marker.memberIds.length,`${name}/${marker.id}: location count mismatch`);
    assert.equal(marker.cluster==='true',marker.memberIds.length>1,`${name}/${marker.id}: cluster semantics mismatch`);
    for(const id of marker.memberIds){assert(breweryById.has(id)&&located(breweryById.get(id)),`${name}: invented or unlocated cluster member ${id}`);assert(!represented.has(id),`${name}: duplicate visible brewery ${id}`);represented.add(id);}
    assert.equal(marker.beerCount,marker.memberIds.reduce((sum,id)=>sum+(beerCounts.get(id)||0),0),`${name}/${marker.id}: beer count confused with location count`);
    if(!marker.rect)continue;
    assert.equal(marker.photoCount,1,`${name}/${marker.id}: use one representative photo per anchor`);
    const beer=beerById.get(marker.beerId);assert(beer&&beer.image,`${name}: unknown representative beer`);assert.equal(marker.src,beer.image);
    assert(marker.memberIds.includes(beer.breweryId),`${name}: representative beer is outside cluster`);
    const brewery=breweryById.get(beer.breweryId);assert(located(brewery));
    assert(Math.abs(marker.anchorLat-brewery.lat)<1e-5&&Math.abs(marker.anchorLng-brewery.lng)<1e-5,`${name}/${marker.id}: photograph moved away from its source brewery coordinates`);
    const error=Math.hypot(marker.center.x-state.wrapper.left-marker.screenX,marker.center.y-state.wrapper.top-marker.screenY);maxAnchorError=Math.max(maxAnchorError,error);
    assert(error<=2.2,`${name}/${marker.id}: image center displaced ${error.toFixed(2)}px from geographic projection`);
    assert(marker.decoded,`${name}/${marker.id}: undecoded photo`);
    assert(marker.rect.left>=Math.max(0,state.wrapper.left)-1&&marker.rect.right<=Math.min(state.width,state.wrapper.right)+1&&marker.rect.top>=Math.max(0,state.wrapper.top)-1&&marker.rect.bottom<=Math.min(state.height,state.wrapper.bottom)+1,`${name}/${marker.id}: visible photo clipped by viewport`);
    assert(marker.rect.width>=12&&marker.rect.height>=12,`${name}/${marker.id}: photo shrunk beyond recognition`);
    if(state.mode==='flat'){
      const [x,y,w,h]=state.viewBox.split(/\s+/).map(Number);
      const projectedX=(marker.anchorLng+180)/360*1000,projectedY=(90-marker.anchorLat)/180*500;
      const expectedX=(projectedX-x)/w*state.wrapper.width,expectedY=(projectedY-y)/h*state.wrapper.height;
      assert(Math.hypot(marker.screenX-expectedX,marker.screenY-expectedY)<=2.2,`${name}/${marker.id}: flat projection disagrees with source lat/lng`);
    }
  }
  const overlaps=[];let maxOverlapFraction=0;
  for(let i=0;i<photos.length;i++)for(let j=i+1;j<photos.length;j++){
    const a=photos[i],b=photos[j],width=Math.max(0,Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)),height=Math.max(0,Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top));
    if(!width||!height)continue;
    const fraction=width*height/Math.min(a.rect.width*a.rect.height,b.rect.width*b.rect.height);maxOverlapFraction=Math.max(maxOverlapFraction,fraction);overlaps.push({a:a.id,b:b.id,area:width*height,fraction});
  }
  // Allow subpixel/antialiasing rounding, but reject material photo occlusion.
  assert(maxOverlapFraction<=0.025,`${name}: worst photo overlap ${(maxOverlapFraction*100).toFixed(1)}%; ${JSON.stringify(overlaps.slice(0,4))}`);
  const sample={name,mode:state.mode,viewport:[state.width,state.height],zoom:state.zoom,totalMarkers:state.totalMarkerNodes,visiblePhotos:photos.length,representedBreweries:represented.size,maxAnchorError,maxOverlapFraction,overlaps,photos:photos.map(marker=>({id:marker.id,beerId:marker.beerId,rect:marker.rect,screenX:marker.screenX,screenY:marker.screenY,exposed:marker.exposed}))};
  measurements.push(sample);return state;
}

async function assertStablePhotoDetail(selector,p=page){
  if(!selector.includes('.globe-bottle')||selector.includes('.globe-bottle-count')||!selector.includes('[data-cluster="false"]'))return;
  await p.locator('.inspector h2').waitFor();await p.waitForTimeout(650);
  assert(await p.locator('.inspector').isVisible(),'Photo selection must remain open after deferred globe events');
  assert.equal(await p.locator('.brewery-tray').count(),0,'Deferred globe selection must not replace beer detail with a brewery tray');
}
async function clickExposed(selector,p=page){
  for(let attempt=0;attempt<10;attempt++){
    const candidate=await p.locator(selector).evaluateAll(nodes=>nodes.map((node,index)=>{
      const box=node.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2,marker=node.closest('[data-marker-id]');
      return {index,x,y,beerId:node.dataset.beerId,markerId:marker?.dataset.markerId,breweryId:marker?.dataset.breweryId,members:marker?.dataset.memberIds?JSON.parse(marker.dataset.memberIds):[],ok:box.width&&box.height&&x>3&&x<innerWidth-3&&y>3&&y<innerHeight-3&&node.contains(document.elementFromPoint(x,y))};
    }).find(item=>item.ok));
    if(candidate){const item=p.locator(selector).nth(candidate.index);if(await p.evaluate(()=>matchMedia('(pointer:coarse)').matches))await item.tap();else await item.click();await assertStablePhotoDetail(selector,p);return candidate;}
    await p.waitForTimeout(200);
  }throw Error(`No exposed clickable target: ${selector}`);
}
async function screenshot(name,p=page){await p.mouse.move(0,0);await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(output,`anchored-${name}.png`),animations:'disabled'});}
async function check(name,fn){activeCase=name;await fn();results.push({name,passed:true});console.log(`PASS ${name}`);}

try{
  for(const key of ['world','archive','openbeer','off']){const response=await fetch(`${base}/data/${key}.json`);assert(response.ok,`${key} HTTP ${response.status}`);source[key]=await response.json();for(const beer of source[key].beers)beerById.set(beer.id,beer);for(const brewery of source[key].breweries)breweryById.set(brewery.id,brewery);}
  for(const mode of ['globe','flat'])for(const device of [{name:'desktop',width:1440,height:900},{name:'tablet',width:1024,height:768},{name:'mobile',width:390,height:844}]){
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:1,isMobile:device.name==='mobile',hasTouch:device.name!=='desktop',reducedMotion:'reduce'});
    await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){external.push(url.href);return route.abort();}return route.continue();});
    page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push({case:activeCase,message:error.message}));
    if(mode==='flat')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
    const prefix=`${mode}-${device.name}`;
    await check(`${prefix}: geographic photo centers and unobstructed global layout`,async()=>{
      await page.goto(base);await settle();assert.equal(await page.getByLabel('选择数据集').inputValue(),'pictured');const state=await inspectAnchors(`${prefix}-global`,'pictured');assert.equal(state.mode,mode,`${prefix}: expected renderer did not load`);await screenshot(`${prefix}-global`);
    });
    await check(`${prefix}: clusters represent real members and expand without opening a random beer`,async()=>{
      const before=await screenState();assert(before.markers.some(marker=>marker.cluster==='true'&&marker.rect),`${prefix}: need dense real-photo cluster fixture`);
      // Prefer a broad European cluster over a same-city pair. Each click may
      // reveal a further cluster, so follow the same original members rather
      // than requiring nearby breweries to separate at the first zoom level.
      const candidates=before.markers.filter(marker=>marker.cluster==='true'&&marker.rect&&marker.exposed).sort((a,b)=>{
        const score=marker=>marker.memberIds.length+(marker.anchorLat>35&&marker.anchorLat<65&&marker.anchorLng>-15&&marker.anchorLng<35?100:0);
        return score(b)-score(a);
      });assert(candidates.length,`${prefix}: need an exposed regional cluster`);
      const target=await clickExposed(`${markerSelector}[data-marker-id=${JSON.stringify(candidates[0].id)}] .globe-bottle[data-cluster="true"]`);await settle();assert.equal(await page.locator('.inspector').count(),0,`${prefix}: cluster opened one arbitrary beer`);
      const picker=page.locator('.globe-cluster-picker');
      let expansionClicks=1;
      while(!(await picker.count())&&expansionClicks<3){
        const current=await screenState(),members=current.markers.filter(marker=>marker.memberIds.some(id=>target.members.includes(id)));
        if(members.length>=2)break;
        const remaining=members.find(marker=>marker.cluster==='true'&&marker.rect&&marker.exposed);
        assert(remaining,`${prefix}: dense cluster disappeared before it could expand`);
        await clickExposed(`${markerSelector}[data-marker-id=${JSON.stringify(remaining.id)}] .globe-bottle[data-cluster="true"]`);await settle();expansionClicks++;
        assert.equal(await page.locator('.inspector').count(),0,`${prefix}: cluster opened one arbitrary beer`);
      }
      if(await picker.count()){
        const names=await picker.locator('li button span').allTextContents(),expectedNames=new Set(target.members.map(id=>{const brewery=breweryById.get(id);return brewery.nameZh||brewery.name;}));assert(names.length>0);assert(names.every(name=>expectedNames.has(name)),`${prefix}: picker includes unrelated locations`);
        const expected=names[0];await picker.locator('li button').first().click();await page.locator('.brewery-tray').waitFor();assert((await page.locator('.brewery-tray').innerText()).includes(expected));await page.getByLabel('关闭酒厂酒款').click();
      }else{
        const after=await screenState();assert(after.zoom>before.zoom*1.02,`${prefix}: cluster click did not zoom in`);assert(after.markers.some(marker=>marker.memberIds.some(id=>target.members.includes(id))),`${prefix}: expanded view lost selected cluster members`);const inspected=await inspectAnchors(`${prefix}-cluster-expanded`,'pictured');const expandedMembers=inspected.markers.filter(marker=>marker.memberIds.some(id=>target.members.includes(id))).length;Object.assign(measurements[measurements.length-1],{expandedOriginalMemberMarkers:expandedMembers,expansionClicks});assert(expandedMembers>=2,`${prefix}: dense cluster did not separate into member anchors after zoom`);await screenshot(`${prefix}-dense-expanded`);
      }
    });
    await check(`${prefix}: single brewery stays anchored, scales with zoom and opens its beer/tray`,async()=>{
      await choose('archive');await clickExposed(`${markerSelector}[data-cluster="false"] .globe-bottle-count`);await page.locator('.brewery-tray').waitFor();await page.getByLabel('关闭酒厂酒款').click();await settle();await page.getByLabel('缩小地球',{exact:true}).click();await page.getByLabel('缩小地球',{exact:true}).click();await settle();const before=await inspectAnchors(`${prefix}-archive-wide`,'archive');const first=before.markers.find(marker=>marker.rect&&marker.cluster==='false');assert(first,`${prefix}: isolated BrewDog fixture missing`);
      await page.getByLabel('放大地球',{exact:true}).click();await page.getByLabel('放大地球',{exact:true}).click();await settle();const after=await inspectAnchors(`${prefix}-archive-zoom`,'archive'),zoomed=after.markers.find(marker=>marker.beerId===first.beerId);assert(zoomed,`${prefix}: isolated photo disappeared during zoom`);
      assert(after.zoom>before.zoom,`${prefix}: zoom controls did not change camera scale`);assert(zoomed.rect.height>first.rect.height*1.05,`${prefix}: photo size did not adapt to zoom`);
      const target=await clickExposed(singlePhoto);await page.locator('.inspector h2').waitFor();assert.equal(await page.locator('.inspector h2').innerText(),beerById.get(target.beerId).name);await closeDetails();await settle();
      const badge=await clickExposed(`${markerSelector}[data-cluster="false"] .globe-bottle-count`);await page.locator('.brewery-tray').waitFor();const expected=source.archive.beers.filter(beer=>beer.breweryId===badge.breweryId);assert(expected.length>0);assert.deepEqual(await page.locator('.tray-bottles>button>span').allTextContents(),expected.slice(0,24).map(beer=>beer.name));await page.getByLabel('关闭酒厂酒款').click();await screenshot(`${prefix}-zoom`);
    });
    await context.close();
  }
  assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(external,[],'Map must work with local assets only');
}catch(error){results.push({name:activeCase,passed:false,error:error.stack});process.exitCode=1;console.error(error);try{await page?.screenshot({path:path.join(output,'anchored-failure.png')});}catch{}}
finally{await writeFile(path.join(output,'anchored-results.json'),JSON.stringify({testedAt:new Date().toISOString(),base,browser:await browser.version(),sourceCounts:Object.fromEntries(Object.entries(source).map(([name,data])=>[name,data.beers.length])),thresholds:{maxAnchorErrorPixels:2.2,maxPairwisePhotoOverlapFraction:0.025},results,measurements,errors,external},null,2));await browser.close();}
