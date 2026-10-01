import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const runtime = createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`);
let playwright; try {playwright = await import('playwright');} catch {playwright = runtime('playwright');}
const sharp = runtime('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'qa'), base = process.env.DEMO_URL || 'http://127.0.0.1:4173', origin = new URL(base).origin;
const overlap = (a,b) => Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0, Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
const report = {startedAt:new Date().toISOString(), base, policy:'Every external request is blocked. No former photo-count quota is required: available land determines density. DOM rectangles are checked against the projected mask, and independent screenshots of the underlying rendered map are checked for definite ocean-coloured pixels.', checks:[], layouts:[], screenshots:[], underlays:[], external:[], pageErrors:[], localErrors:[], consoleErrors:[]};
let browser, page, data, byBeer, byBrewery, activeCase='initialize';
await mkdir(output,{recursive:true});

async function check(name,fn){activeCase=name;await fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`);}
async function open(viewport,flat=false){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:viewport.width<500,hasTouch:viewport.width<500,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){report.external.push({case:activeCase,url:u.href,type:req.resourceType()});return route.abort('failed');}return route.continue();});
  const p=await context.newPage();p.setDefaultTimeout(18000);
  p.on('pageerror',e=>report.pageErrors.push({case:activeCase,message:e.message}));
  p.on('console',m=>{if(m.type()==='error')report.consoleErrors.push({case:activeCase,message:m.text()});});
  p.on('response',r=>{if(new URL(r.url()).origin===origin&&r.status()>=400)report.localErrors.push({url:r.url(),status:r.status()});});
  if(flat)await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:get.call(this,type,...args);};});
  await p.goto(`${base}/?collection=beertasting`,{waitUntil:'domcontentloaded'});await p.getByLabel('选择数据集',{exact:true}).waitFor();await settle(p);return p;
}
async function settle(p=page){
  await p.waitForFunction(()=>!!document.querySelector('.brew-globe-view')?._landMask?.containsRect);
  await p.waitForTimeout(700);
  await p.waitForFunction(()=>[...document.querySelectorAll('.brew-globe-view .globe-bottle')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(n).visibility!=='hidden';}).every(n=>{const i=n.querySelector('img');return i?.complete&&i.naturalWidth>0&&n.dataset.imageState==='ready';}));
}
async function capture(name){
  await page.mouse.move(0,0);const f=path.join(output,`land-layout-${name}.png`);await page.screenshot({path:f,animations:'disabled'});report.screenshots.push(f);
}
async function controlsFit(){
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal document overflow');
  const invalid=await page.locator('.facet-tabs button,.dock-main input,.dock-main select,.dock-main>button').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&(r.left<-.5||r.right>innerWidth+.5||r.top<-.5||r.bottom>innerHeight+.5);}).map(n=>n.getAttribute('aria-label')||n.textContent));assert.deepEqual(invalid,[]);
}
async function snapshot(name,{wait=true,pixels=true,requirePhotos=false}={}){
  if(wait)await settle();
  const s=await page.evaluate(()=>{
    const w=document.querySelector('.brew-globe-view'),wr=w.getBoundingClientRect(),mask=w._landMask;
    const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const shown=n=>{for(let a=n;a;a=a.parentElement){const c=getComputedStyle(a);if(c.display==='none'||c.visibility==='hidden'||Number(c.opacity)===0)return false;}return true;};
    const visible=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&shown(n);};
    const photos=[...w.querySelectorAll('.globe-bottle')].filter(visible).map(n=>{const r=rect(n),i=n.querySelector('img'),bounds={left:r.left-wr.left,top:r.top-wr.top,right:r.right-wr.left,bottom:r.bottom-wr.top};return{beerId:n.dataset.beerId,breweryId:n.dataset.sourceBreweryId,lat:Number(n.dataset.sourceLat),lng:Number(n.dataset.sourceLng),sourceX:Number(n.dataset.sourceScreenX),sourceY:Number(n.dataset.sourceScreenY),offsetX:Number(n.dataset.displayOffsetX),offsetY:Number(n.dataset.displayOffsetY),src:i?.getAttribute('src'),complete:i?.complete,naturalWidth:i?.naturalWidth,naturalHeight:i?.naturalHeight,rect:r,bounds,onLand:!!mask?.containsRect(bounds),landComponent:mask?.componentAt((bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2)};});
    const badges=[...w.querySelectorAll('.globe-bottle-count')].filter(visible).map(n=>({text:n.textContent,...rect(n)}));
    const obstacles=[...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.inspector,.brewery-tray,.compare-dock')].filter(visible).map(n=>({className:n.className,...rect(n)}));
    return{mode:w.dataset.mapMode,zoom:Number(w.dataset.zoomScale||1),viewport:[innerWidth,innerHeight],wrapper:rect(w),mask:mask?{width:mask.width,height:mask.height}:null,photos,badges,obstacles};
  });
  const row={name,...s,visiblePhotos:s.photos.length,maxPhotoHeight:Math.max(0,...s.photos.map(p=>p.rect.height)),maxPhotoWidth:Math.max(0,...s.photos.map(p=>p.rect.width)),maximumOverlapArea:0};report.layouts.push(row);
  if(pixels&&s.photos.length)await independentPixels(name,row);
  if(!s.mask)assert.equal(s.photos.length,0,`${name}: photos shown before a land mask is ready`);
  if(requirePhotos)assert(s.photos.length>0,`${name}: empty beer map`);
  const seen=new Set();
  for(const p of s.photos){
    const b=byBeer.get(p.beerId),br=byBrewery.get(p.breweryId);assert(b&&br);assert.equal(b.breweryId,br.id);assert.equal(p.src,b.imageThumbnail||b.image);assert.equal(p.lat,br.lat);assert.equal(p.lng,br.lng);assert(!seen.has(p.beerId));seen.add(p.beerId);
    assert(p.onLand,`${name}: ${p.beerId} rectangle extends outside projected land`);
    if(wait)assert(p.complete&&p.naturalWidth>0&&p.naturalHeight>0,`${name}: incomplete local thumbnail`);
    assert(p.rect.left>=Math.max(0,s.wrapper.left)-1&&p.rect.right<=Math.min(s.viewport[0],s.wrapper.right)+1&&p.rect.top>=Math.max(0,s.wrapper.top)-1&&p.rect.bottom<=Math.min(s.viewport[1],s.wrapper.bottom)+1,`${name}: clipped image rectangle`);
    for(const o of s.obstacles)assert(overlap(p.rect,o)<=1,`${name}: photo covers ${o.className}`);
    const error=Math.hypot(p.rect.left+p.rect.width/2-s.wrapper.left-p.sourceX-p.offsetX,p.rect.top+p.rect.height/2-s.wrapper.top-p.sourceY-p.offsetY);if(wait)assert(error<=2.3,`${name}: source-coordinate/offset mismatch`);
  }
  for(let i=0;i<s.photos.length;i++)for(let j=0;j<i;j++){const area=overlap(s.photos[i].rect,s.photos[j].rect);row.maximumOverlapArea=Math.max(row.maximumOverlapArea,area);assert(area<=1,`${name}: overlapping beer images (${area}px²)`);}
  for(let i=0;i<s.badges.length;i++){const b=s.badges[i];for(const p of s.photos)assert(overlap(b,p.rect)<=1,`${name}: badge covers image`);for(const o of s.obstacles)assert(overlap(b,o)<=1,`${name}: badge covers ${o.className}`);for(const a of s.badges.slice(0,i))assert(overlap(a,b)<=1,`${name}: badges overlap`);}
  await controlsFit();
  return row;
}
async function independentPixels(name,row){
  // Opacity hides all descendants even when their inline visibility is visible.
  // This changes only the test browser's compositing, not the terrain renderer.
  const hide=await page.addStyleTag({content:'.brew-globe-view .globe-bottle-marker,.brew-globe-view .globe-site-marker{opacity:0!important}'});
  let png;
  try{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));png=await page.screenshot({animations:'disabled'});}finally{await hide.evaluate(n=>n.remove());}
  const file=path.join(output,`land-layout-${name}-underlay.png`);await writeFile(file,png);report.underlays.push(file);
  const {data:rgb,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const check={samples:0,landLike:0,ambiguous:0,definiteOcean:0,oceanExamples:[],rule:'Independent rendered screenshot pixels: definite ocean if blue >= green+5 and blue >= red+8; land-like if green >= blue+2 and green >= red+5. Ambiguous shading is reported, not assumed ocean. Raster samples every 2 CSS pixels inside each rectangle, including near its edges.'};
  for(const p of row.photos){
    const xs=[],ys=[];for(let x=p.rect.left+.75;x<p.rect.right-.75;x+=2)xs.push(x);xs.push(p.rect.right-.75);for(let y=p.rect.top+.75;y<p.rect.bottom-.75;y+=2)ys.push(y);ys.push(p.rect.bottom-.75);
    for(const xf of xs)for(const yf of ys){const x=Math.min(info.width-1,Math.max(0,Math.round(xf))),y=Math.min(info.height-1,Math.max(0,Math.round(yf))),at=(y*info.width+x)*info.channels,[r,g,b]=[rgb[at],rgb[at+1],rgb[at+2]];check.samples++;
      if(b>=g+5&&b>=r+8){check.definiteOcean++;if(check.oceanExamples.length<24)check.oceanExamples.push({beerId:p.beerId,x,y,rgb:[r,g,b]});}
      else if(g>=b+2&&g>=r+5)check.landLike++;else check.ambiguous++;
    }
  }
  row.independentPixels=check;
  assert.equal(check.definiteOcean,0,`${name}: independent map screenshot contains ${check.definiteOcean} definite ocean pixels under image rectangles`);
}
async function clickVisible(selector){
  for(let attempt=0;attempt<12;attempt++){
    const p=await page.locator(selector).evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),hit=[[.5,.5],[.3,.3],[.7,.7]].map(([fx,fy])=>({x:r.x+r.width*fx,y:r.y+r.height*fy})).find(({x,y})=>r.width&&r.height&&x>1&&x<innerWidth-1&&y>1&&y<innerHeight-1&&n.contains(document.elementFromPoint(x,y)));return hit?{...hit,beerId:n.dataset.beerId}:null;}).find(Boolean));
    if(p){await page.mouse.click(p.x,p.y);return p;}await page.waitForTimeout(150);
  }throw Error(`No exposed target: ${selector}`);
}
async function originalPhoto(id){
  await page.waitForFunction(()=>{const n=document.querySelector('.inspector-hero .beer-photo'),i=n?.querySelector('img');return n?.dataset.imageState==='ready'&&i?.complete&&i.naturalWidth>0;});
  const d=await page.locator('.inspector-hero .beer-photo').evaluate(n=>{const i=n.querySelector('img'),r=n.getBoundingClientRect(),ir=i.getBoundingClientRect();return{src:i.getAttribute('src'),width:r.width,height:r.height,imageWidth:ir.width,imageHeight:ir.height,fit:getComputedStyle(i).objectFit};});
  assert.equal(d.src,byBeer.get(id).imageOriginal||byBeer.get(id).image);assert.equal(d.fit,'contain');assert(d.imageWidth<=d.width+2&&d.imageHeight<=d.height+2);return d;
}
async function panel(name){const b=page.getByRole('button',{name,exact:true});if(await b.getAttribute('aria-expanded')!=='true')await b.click();}
async function closePanel(){if(await page.getByLabel('收起筛选',{exact:true}).count())await page.getByLabel('收起筛选',{exact:true}).click();}
async function closeDetails(){if(await page.locator('.inspector').count())await page.getByLabel('关闭酒款详情',{exact:true}).click();}
async function dragMap(){
  const hit=await page.evaluate(()=>{const w=document.querySelector('.brew-globe-view'),r=w.getBoundingClientRect();for(const [fx,fy]of[[.55,.72],[.7,.63],[.38,.72],[.55,.5]]){const x=r.left+r.width*fx,y=r.top+r.height*fy,n=document.elementFromPoint(x,y);if(n&&w.contains(n)&&!n.closest('button,.map-summary,.globe-cluster-picker'))return{x,y,dx:Math.min(135,r.width*.22)};}return null;});assert(hit,'No empty map drag area');
  await page.mouse.move(hit.x,hit.y);await page.mouse.down();await page.mouse.move(hit.x+hit.dx,hit.y-15,{steps:10});
  await snapshot('desktop-drag-frame',{wait:false,pixels:false});await page.mouse.up();
}

try{
  const r=await fetch(`${base}/data/beertasting.json`);assert(r.ok);data=await r.json();byBeer=new Map(data.beers.map(b=>[b.id,b]));byBrewery=new Map(data.breweries.map(b=>[b.id,b]));report.data={beers:data.beers.length,images:data.beers.filter(b=>b.image).length,breweries:data.breweries.length};assert(report.data.beers>0);assert(report.data.images>0);
  browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  page=await open({width:1440,height:900});
  await check('Desktop compact beer rectangles stay inside rendered land and clear of controls',async()=>{const s=await snapshot('desktop-home',{requirePhotos:true});assert.equal(s.mode,'globe');assert(s.maxPhotoHeight<=36.5,'Desktop compact image boxes exceed 36px design height');await capture('desktop');});
  await check('Zoom and rotation keep visible local images on land without image overlap',async()=>{await page.getByLabel('放大地球',{exact:true}).click();await snapshot('desktop-zoom');await capture('desktop-zoom');await dragMap();await snapshot('desktop-rotated');await capture('desktop-rotated');await page.getByLabel('重置地球视角',{exact:true}).click();await settle();});
  await check('Opening the original photo and brewery panel respects land and panel boundaries',async()=>{
    const clicked=await clickVisible('.brew-globe-view .globe-bottle');await page.locator('.inspector h2').waitFor();assert.equal((await page.locator('.inspector h2').innerText()).replace(/\s+/g,' ').trim(),byBeer.get(clicked.beerId).name.replace(/\s+/g,' ').trim());report.originalPhoto=await originalPhoto(clicked.beerId);await snapshot('desktop-detail');await capture('desktop-detail');await closeDetails();
    const br=data.breweries.find(b=>/Tree House/i.test(b.name))||data.breweries.find(b=>data.beers.some(x=>x.breweryId===b.id&&x.image));
    await panel('酒厂与地区');await page.getByLabel('按酒厂筛选',{exact:true}).selectOption(br.id);await closePanel();await snapshot('desktop-one-brewery');
    await clickVisible('.brew-globe-view .globe-bottle-count');await page.getByLabel('此酒厂的酒款',{exact:true}).waitFor();await snapshot('desktop-brewery-panel');await capture('desktop-brewery-panel');
  });
  for(const device of[{name:'tablet',width:1024,height:768},{name:'mobile',width:390,height:844}]){
    await page.context().close();page=await open({width:device.width,height:device.height});
    await check(`${device.name}: compact local images fit land and all main controls`,async()=>{const s=await snapshot(`${device.name}-home`,{requirePhotos:true});assert(s.maxPhotoHeight<=(device.name==='mobile'?34.5:36.5));await capture(device.name);await page.getByLabel('放大地球',{exact:true}).click();await snapshot(`${device.name}-zoom`);});
  }
  await page.context().close();page=await open({width:1440,height:900},true);
  await check('Flat fallback and its zoom remain inside actual rendered continents',async()=>{assert.equal((await snapshot('flat-home',{requirePhotos:true})).mode,'flat');await capture('flat');await page.getByLabel('放大地球',{exact:true}).click();await snapshot('flat-zoom');await capture('flat-zoom');});
  await check('No external requests, failed local assets or uncaught browser errors',async()=>{assert.deepEqual(report.external,[]);assert.deepEqual(report.localErrors,[]);assert.deepEqual(report.pageErrors,[]);});
  report.passed=true;
}catch(e){report.passed=false;report.failure={case:activeCase,message:e.message,stack:e.stack};report.checks.push({name:activeCase,passed:false,message:e.message});console.error(e);process.exitCode=1;if(page&&!page.isClosed())try{await capture('failure');}catch{}}
finally{await browser?.close();report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'land-layout-results.json'),JSON.stringify(report,null,2)+'\n');}
