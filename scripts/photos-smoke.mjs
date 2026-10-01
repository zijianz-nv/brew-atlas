import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

let playwright;
try{playwright=await import('playwright');}catch{playwright=createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright');}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.DEMO_URL||'http://127.0.0.1:4173',origin=new URL(base).origin;
await mkdir(path.join(root,'qa'),{recursive:true});
const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[],errors=[],external=[];
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
await context.route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin){external.push(url.href);return route.abort();}return route.continue();});
context.on('page',p=>p.on('pageerror',error=>errors.push(error.message)));
const page=await context.newPage();page.setDefaultTimeout(15000);
const sources={};
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(`PASS ${name}`);};
const located=b=>b&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180;
const ready=async(p=page)=>{await p.locator('.app').waitFor();await p.getByLabel('选择数据集').waitFor();};
const settle=async(p=page)=>{await p.waitForFunction(()=>document.querySelector('.brew-globe-view canvas')?.width>0||document.querySelector('.globe-flat-map svg'));await p.waitForTimeout(1000);};
const nav=async(index,p=page)=>p.locator('.main-nav button').nth(index).click();
const choose=async(value,p=page)=>p.getByLabel('选择数据集').selectOption(value);
const close=async(p=page)=>{if(await p.locator('.inspector').count())await p.getByLabel('关闭酒款详情',{exact:true}).click();};
const waitCount=async(n,p=page)=>p.waitForFunction(n=>Number(document.querySelector('.library-heading>span')?.textContent.match(/[\d,]+/)?.[0]?.replaceAll(',',''))===n&&document.querySelectorAll('.beer-card').length===Math.min(60,n),n);
async function decode(p,beers){
  return p.evaluate(async beers=>{
    let next=0;const failures=[];
    await Promise.all(Array.from({length:Math.min(8,beers.length)},async()=>{while(next<beers.length){const beer=beers[next++],img=new Image();let timer;try{img.src=beer.image;await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),20000);})]);if(!img.naturalWidth||!img.naturalHeight)throw Error('zero dimensions');}catch(error){failures.push({id:beer.id,image:beer.image,error:String(error)});}finally{clearTimeout(timer);img.src='';}}}));return failures;
  },beers.map(({id,image})=>({id,image})));
}
async function screenshot(name,p=page){
  await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(image=>{const box=image.getBoundingClientRect();return box.width&&box.height&&box.right>0&&box.left<innerWidth&&box.bottom>0&&box.top<innerHeight;}).map(image=>{image.loading='eager';return image.decode().catch(()=>{});}));});
  await p.screenshot({path:path.join(root,'qa',`${name}.png`),animations:'disabled'});
}
async function checkMapGeometry(p=page){
  const result=await p.evaluate(()=>{
    const wrapper=document.querySelector('.brew-globe-view'),bounds=wrapper.getBoundingClientRect();
    const nodes=[...wrapper.querySelectorAll('[data-marker-id]')].filter(node=>getComputedStyle(node).visibility!=='hidden'&&getComputedStyle(node).display!=='none');
    const rects=nodes.map(node=>{const image=node.querySelector('.globe-bottle img,.globe-site-dot'),r=image?.getBoundingClientRect();if(!r||!r.width||!r.height)return null;return {id:node.dataset.markerId,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,error:Math.hypot(r.left+r.width/2-bounds.left-Number(node.dataset.screenX),r.top+r.height/2-bounds.top-Number(node.dataset.screenY))};}).filter(Boolean);
    const failures=[];for(const r of rects){if(r.error>2.2)failures.push(`Displaced ${r.id}: ${r.error}`);if(r.left<Math.max(0,bounds.left)-1||r.right>Math.min(innerWidth,bounds.right)+1||r.top<Math.max(0,bounds.top)-1||r.bottom>Math.min(innerHeight,bounds.bottom)+1)failures.push(`Clipped ${r.id}`);}
    for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j],area=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));if(area/Math.min(a.width*a.height,b.width*b.height)>.025)failures.push(`Overlap ${a.id}/${b.id}`);}
    return {markers:rects.length,failures,connectors:wrapper.querySelectorAll('.globe-bottle-marker svg').length};
  });
  assert(result.markers>0,'Actual visible markers required');assert.equal(result.connectors,0,'No geographic leader lines');assert.deepEqual(result.failures,[],'Actual marker geometry must fit without displacement or material overlap');
}
async function assertStablePhotoDetail(selector,p=page){
  if(!selector.includes('.globe-bottle')||selector.includes('.globe-bottle-count')||!selector.includes('[data-cluster="false"]'))return;
  await p.locator('.inspector h2').waitFor();await p.waitForTimeout(650);
  assert(await p.locator('.inspector').isVisible(),'Photo selection must remain open after deferred globe events');
  assert.equal(await p.locator('.brewery-tray').count(),0,'Deferred globe selection must not replace beer detail with a brewery tray');
}
async function clickExposed(selector,p=page){
  for(let attempt=0;attempt<8;attempt++){
    const target=await p.locator(selector).evaluateAll(nodes=>nodes.map((node,index)=>{const box=node.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;return {index,x,y,beerId:node.dataset.beerId,ok:box.width&&box.height&&x>3&&x<innerWidth-3&&y>3&&y<innerHeight-3&&node.contains(document.elementFromPoint(x,y))};}).find(item=>item.ok));
    if(target){await p.locator(selector).nth(target.index).click();await assertStablePhotoDetail(selector,p);return target;}
    await p.waitForTimeout(250);
  }throw Error(`No exposed target: ${selector}`);
}
let counts;
try{
  for(const key of ['off','world','archive','openbeer']){const response=await context.request.get(`${base}/data/${key}.json`);assert(response.ok(),`${key}: HTTP ${response.status()}`);sources[key]=await response.json();}
  const all=Object.values(sources).flatMap(source=>source.beers),pictured=all.filter(beer=>beer.image),off=sources.off.beers;
  const breweries=new Map(Object.values(sources).flatMap(source=>source.breweries).map(b=>[b.id,b]));
  const byId=new Map(all.map(beer=>[beer.id,beer])),mapped=off.filter(beer=>located(breweries.get(beer.breweryId))),unmapped=off.filter(beer=>!located(breweries.get(beer.breweryId)));
  counts={all:all.length,pictured:pictured.length,off:off.length,offMapped:mapped.length,offUnmapped:unmapped.length};console.log('Photo source counts',counts);
  assert(off.length>0&&off.every(beer=>beer.image),'OFF collection must have a real photo for every accepted product');
  await check('Default view is the pictured collection and every map image references a real pictured record',async()=>{
    await page.goto(base);await ready();await settle();assert.equal(await page.getByLabel('选择数据集').inputValue(),'pictured');assert.equal(await page.locator('.inspector').count(),0);
    const count=Number((await page.locator('.map-summary strong').first().innerText()).replaceAll(',',''));assert.equal(count,pictured.length);
    const marks=await page.locator('.globe-bottle').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.beerId,src:node.querySelector('img')?.getAttribute('src')})));
    assert(marks.length>0);for(const mark of marks){assert(byId.has(mark.id));assert.equal(mark.src,byId.get(mark.id).image);assert(located(breweries.get(byId.get(mark.id).breweryId)));}
    await checkMapGeometry(page);
    const target=await clickExposed('.globe-bottle[data-cluster="false"]');await page.locator('.inspector h2').waitFor();assert.equal(await page.locator('.inspector h2').innerText(),byId.get(target.beerId).name);await close();await screenshot('photos-desktop-map');
  });
  await check('Pictured library has no blank-image cards and OFF pagination uses actual source records',async()=>{
    await nav(1);await waitCount(pictured.length);assert.equal(await page.locator('.beer-card .image-fallback').count(),0);assert.equal(await page.locator('.beer-card img').count(),Math.min(60,pictured.length));
    await choose('off');await waitCount(off.length);assert.deepEqual(await page.locator('.beer-card h3').allTextContents(),off.slice(0,60).map(beer=>beer.name));
    if(off.length>60){await page.getByLabel('下一页',{exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('.beer-card').length===n,Math.min(60,off.length-60));assert.deepEqual(await page.locator('.beer-card h3').allTextContents(),off.slice(60,120).map(beer=>beer.name));await page.getByLabel('上一页',{exact:true}).click();await waitCount(off.length);}
    await screenshot('photos-desktop-library');
  });
  await check('OFF detail exposes actual photo, source links and attribution',async()=>{
    const beer=off[0];await page.goto(`${base}/?beer=${encodeURIComponent(beer.id)}`);await ready();await page.locator('.inspector h2').waitFor();assert.equal(await page.locator('.inspector h2').innerText(),beer.name);
    assert.equal(await page.locator('.inspector-hero img').getAttribute('src'),beer.image);assert.equal(await page.locator('.inspector-hero .image-fallback').count(),0);
    await page.locator('.source-details summary').click();const text=await page.locator('.source-details').innerText();assert(text.includes(beer.imageCredit),'Image attribution must be visible');assert.match(text,/Open Food Facts|CC BY-SA/i);
    const links=await page.locator('.source-details a').evaluateAll(nodes=>nodes.map(node=>node.href));assert(links.includes(beer.imageSource));assert(beer.sourceUrls.some(url=>links.includes(url)));assert.doesNotMatch(await page.locator('.inspector').innerText(),/NaN|undefined/);await screenshot('photos-source-detail');await close();
  });
  await check('Every new OFF local image decodes without relying on an external host',async()=>{
    assert.deepEqual(await decode(page,off),[]);assert.deepEqual(external,[]);results.push({name:'OFF image decode count',passed:true,images:off.length});
  });
  await check('OFF unknown origins stay off the map and remain available in the library',async()=>{
    assert(unmapped.length>0,'Need an unknown-origin example to verify honest geography');
    const beer=unmapped[0];await page.goto(`${base}/?beer=${encodeURIComponent(beer.id)}`);await ready();await page.locator('.inspector h2').waitFor();await page.locator('.detail-tabs').getByRole('button',{name:'酒厂',exact:true}).click();
    assert(await page.getByRole('button',{name:'在地图上查看',exact:true}).isDisabled());assert.match(await page.locator('.location-note').innerText(),/未提供|未核验|未知/);
    await close();await settle();assert.equal(await page.locator(`[data-brewery-id="${beer.breweryId}"]`).count(),0);await nav(1);await choose('off');await page.getByLabel('搜索酒款酒厂或国家').fill(beer.name);await page.getByRole('heading',{name:beer.name,exact:true}).first().waitFor();
  });
  await check('A matched OFF brand reference opens its own real bottle image and brewery tray',async()=>{
    assert(mapped.length>0,'Need a sourced map reference to verify pictured OFF interaction');const beer=mapped[0];
    await page.goto(`${base}/?beer=${encodeURIComponent(beer.id)}`);await ready();await page.locator('.inspector h2').waitFor();await page.locator('.detail-tabs').getByRole('button',{name:'酒厂',exact:true}).click();await page.getByRole('button',{name:'在地图上查看',exact:true}).click();await settle();
    assert.equal(await page.getByLabel('选择数据集').inputValue(),'off');await page.locator('.brewery-tray').waitFor();assert(await page.locator('.tray-bottles img').count()>0);await page.getByLabel('关闭酒厂酒款').click();
    const target=await clickExposed(`.globe-bottle-marker[data-brewery-id="${beer.breweryId}"] .globe-bottle[data-cluster="false"]`);await page.locator('.inspector h2').waitFor();assert.equal(byId.get(target.beerId).collection,'off');assert.equal(await page.locator('.inspector h2').innerText(),byId.get(target.beerId).name);await close();
  });
  await check('Phone photo library and details fit the viewport and retain a visible image',async()=>{
    await page.setViewportSize({width:390,height:844});await page.goto(base);await ready();await nav(1);await choose('off');await waitCount(off.length);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await page.locator('.beer-card .image-fallback').count(),0);await screenshot('photos-mobile-library');
    await page.locator('.beer-card-main').first().click();await page.locator('.inspector h2').waitFor();assert.equal(await page.locator('.inspector-hero img').getAttribute('src'),off[0].image);assert.deepEqual(await decode(page,[off[0]]),[]);await screenshot('photos-mobile-detail');await close();
  });
  await check('Phone flat-map fallback keeps real photos clickable with bounded markers',async()=>{
    const fallback=await context.newPage();await fallback.setViewportSize({width:390,height:844});await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
    await fallback.goto(base);await ready(fallback);await fallback.getByRole('img',{name:'世界精酿酒厂平面地图',exact:true}).waitFor();await choose('off',fallback);await settle(fallback);await checkMapGeometry(fallback);assert(await fallback.locator('.globe-flat-map .globe-bottle img').count()>0);
    const target=await clickExposed('.globe-flat-map .globe-bottle[data-cluster="false"]',fallback);await fallback.locator('.inspector h2').waitFor();assert.equal(await fallback.locator('.inspector h2').innerText(),byId.get(target.beerId).name);assert.equal(byId.get(target.beerId).collection,'off');await close(fallback);await screenshot('photos-mobile-fallback',fallback);await fallback.close();
  });
  assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(external,[],'External network dependency');
}catch(error){results.push({name:'Failure',passed:false,error:error.stack});process.exitCode=1;console.error(error);try{await page.screenshot({path:path.join(root,'qa','photos-failure.png')});}catch{}}
finally{await writeFile(path.join(root,'qa','photos-results.json'),JSON.stringify({testedAt:new Date().toISOString(),browser:await browser.version(),base,counts,results,errors,external},null,2));await browser.close();}
