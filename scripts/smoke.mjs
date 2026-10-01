import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
let playwright;
try{playwright=await import('playwright');}catch{playwright=createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`)('playwright');}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=process.env.DEMO_URL||'http://127.0.0.1:4173',origin=new URL(base).origin;
await mkdir(path.join(root,'qa'),{recursive:true});
const browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const external=[],errors=[],results=[],layouts=[];
await context.route('**/*',route=>{const u=new URL(route.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){external.push(u.href);return route.abort();}return route.continue();});
context.on('page',p=>p.on('pageerror',e=>errors.push({url:p.url(),message:e.message})));
const page=await context.newPage();page.setDefaultTimeout(12000);
const source={},PAGE_SIZE=60;
for(const key of ['world','archive','openbeer','off']){const r=await context.request.get(`${base}/data/${key}.json`);assert(r.ok(),`${key}: HTTP ${r.status()}`);source[key]=await r.json();}
const all=Object.values(source).flatMap(s=>s.beers),breweries=[...new Map(Object.values(source).flatMap(s=>s.breweries).map(b=>[b.id,b])).values()];
const breweryById=new Map(breweries.map(b=>[b.id,b]));
const located=b=>Boolean(b)&&typeof b.lat==='number'&&typeof b.lng==='number'&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180;
const pictured=all.filter(b=>typeof b.image==='string'&&b.image.length>0);
const usedBreweryIds=new Set(all.map(b=>b.breweryId)),usedBreweries=breweries.filter(b=>usedBreweryIds.has(b.id));
const picturedBreweryIds=new Set(pictured.map(b=>b.breweryId));
const counts={...Object.fromEntries(Object.entries(source).map(([key,s])=>[key,s.beers.length])),all:all.length,breweries:usedBreweries.length,rawBreweries:breweries.length,locatedBreweries:usedBreweries.filter(located).length,countries:new Set(usedBreweries.map(b=>b.country).filter(Boolean)).size,pictured:pictured.length};
const integer=text=>Number(text.replaceAll(',',''));
console.log('Production source counts',counts);
const check=async(name,fn)=>{await fn();results.push({name,passed:true});console.log(`PASS ${name}`);};
const ready=async(p=page)=>{await p.locator('.app').waitFor();await p.getByLabel('搜索酒款酒厂或国家').waitFor();};
const nav=async(index,p=page)=>p.locator('.main-nav button').nth(index).click();
const choose=async(value,p=page)=>p.getByLabel('选择数据集').selectOption(value);
const count=async(n,p=page,pageIndex=0)=>p.waitForFunction(({total,pageIndex,pageSize})=>{
  const text=document.querySelector('.library-heading>span')?.textContent||'';
  const shown=Number(text.match(/[\d,]+/)?.[0]?.replaceAll(',',''));
  return shown===total&&document.querySelectorAll('.beer-card').length===Math.min(pageSize,Math.max(0,total-pageIndex*pageSize));
},{total:n,pageIndex,pageSize:PAGE_SIZE});
const closeDetail=async(p=page)=>{if(await p.locator('.inspector').count())await p.getByLabel('关闭酒款详情',{exact:true}).click();};
async function settle(p=page){await p.waitForFunction(()=>document.querySelector('.brew-globe-view canvas')?.width>0||document.querySelector('.globe-flat-map svg'));await p.waitForTimeout(1500);}
async function filters(p=page){const button=p.getByLabel('更多筛选',{exact:true});if(await button.getAttribute('aria-expanded')!=='true')await button.click();}
const cardNames=(p=page)=>p.locator('.beer-card h3').allTextContents();
async function range(start,end,p=page){await p.waitForFunction(({start,end})=>{const nums=(document.querySelector('.page-position')?.textContent||'').replaceAll(',','').match(/\d+/g)?.map(Number);return nums?.[0]===start&&nums?.[1]===end;},{start,end});}
async function shot(name,p=page){
  const failed=await p.evaluate(async()=>{
    await document.fonts.ready;
    const images=[...document.images].filter(im=>{const r=im.getBoundingClientRect(),s=getComputedStyle(im);return r.width&&r.height&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.visibility!=='hidden'&&s.display!=='none';});
    let i=0;const failed=[];
    await Promise.all(Array.from({length:Math.min(12,images.length)},async()=>{while(i<images.length){const im=images[i++];im.loading='eager';let timer;try{await Promise.race([im.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),12000);})]);if(!im.naturalWidth)throw Error('empty image');}catch{failed.push(im.currentSrc||im.src);}finally{clearTimeout(timer);}}}));return failed;
  });
  assert.deepEqual(failed,[],'Visible image decode before screenshot');await p.waitForTimeout(180);await p.screenshot({path:path.join(root,'qa',`${name}.png`),fullPage:false,animations:'disabled'});
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
  for(let retry=0;retry<8;retry++){
    const index=await p.locator(selector).evaluateAll(nodes=>nodes.findIndex(node=>{const r=node.getBoundingClientRect();if(!r.width||!r.height)return false;const x=r.left+r.width/2,y=r.top+r.height/2;if(x<3||x>innerWidth-3||y<3||y>innerHeight-3)return false;const hit=document.elementFromPoint(x,y);return hit===node||node.contains(hit);}));
    if(index>=0){const item=p.locator(selector).nth(index),label=await item.getAttribute('aria-label');await item.click({timeout:3000});await assertStablePhotoDetail(selector,p);return label;}
    await p.waitForTimeout(250);
  }throw Error(`No exposed clickable target: ${selector}`);
}
async function layout(name,width,height){
  await page.setViewportSize({width,height});await page.goto(base);await ready();await settle();
  const m=await page.evaluate(()=>{const r=document.querySelector('.filter-dock').getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,inspectorCount:document.querySelectorAll('.inspector').length,dock:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom},navNames:[...document.querySelectorAll('.main-nav button')].map(b=>b.getAttribute('aria-label'))};});
  assert.equal(m.inspectorCount,0,`${name}: inspector initially open`);assert(m.scrollWidth<=width,`${name}: horizontal overflow`);
  assert(m.dock.y>height*.55&&m.dock.bottom<=height+1&&height-m.dock.bottom<=40,`${name}: dock not at viewport bottom`);
  assert(m.dock.x>=0&&m.dock.x+m.dock.width<=width+1,`${name}: clipped dock`);assert(m.navNames.every(Boolean),`${name}: navigation lacks accessible names`);
  layouts.push({name,...m});await shot(name);
}
try{
  await check('First view renders aggregated real bottle images, dynamic counts and no inspector',async()=>{
    await page.goto(base);await ready();await settle();assert.equal(await page.locator('.inspector').count(),0);assert.equal(await page.getByLabel('选择数据集').inputValue(),'pictured');
    const stats=await page.locator('.map-summary strong').allTextContents();assert.equal(integer(stats[0]),counts.pictured);assert.equal(integer(stats[1]),usedBreweries.filter(b=>picturedBreweryIds.has(b.id)&&located(b)).length);
    const n=await page.locator('.globe-bottle').count();assert(n>0&&n<counts.all,'Bottles must be grouped by brewery');
    const groups=await page.locator('.globe-bottle-marker').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.markerId,members:JSON.parse(n.dataset.memberIds),count:Number(n.dataset.beerCount),cluster:n.dataset.cluster,badge:n.querySelector('.globe-bottle-count')?.textContent})));
    assert(groups.length>0&&groups.length<=counts.breweries);for(const g of groups){assert.equal(g.count,pictured.filter(b=>g.members.includes(b.breweryId)).length,g.id);assert(g.members.every(id=>located(breweryById.get(id))),g.id);if(g.cluster==='true')assert.equal(g.badge,`${g.members.length}处`,g.id);else if(g.count>1)assert.equal(Number(g.badge),g.count,g.id);}
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  });
  await check('Desktop, Mac laptop and tablet keep the dock visible and open details only on click',async()=>{
    await layout('desktop',1440,900);await layout('macbook',1280,800);await layout('tablet',1024,768);
    await choose('world');await settle();const label=await clickExposed('.globe-bottle[data-cluster="false"]');await page.locator('.inspector h2').waitFor();assert.equal(`查看 ${await page.locator('.inspector h2').innerText()}`,label);await closeDetail();
  });
  await check('Dataset, flavor, ABV, text search and reset filter actual production records',async()=>{
    await page.setViewportSize({width:1440,height:900});await nav(1);await choose('world');await count(counts.world);
    await page.locator('.flavor-chips').getByRole('button',{name:'柑橘',exact:true}).click();
    const citrus=source.world.beers.filter(b=>(b.flavors||[]).some(f=>f.includes('柑橘')||'柑橘'.includes(f)));assert(citrus.length>0&&citrus.length<counts.world);await count(citrus.length);
    await page.getByLabel('更多筛选',{exact:true}).click();await page.getByLabel('按酒精度筛选').selectOption('strong');await count(citrus.filter(b=>typeof b.abv==='number'&&b.abv>7).length);
    for(const text of await page.locator('.card-copy>span').allTextContents())assert(parseFloat(text)>7,text);
    await page.locator('.reset-filter').click();await count(counts.world);await page.getByLabel('搜索酒款酒厂或国家').fill('没有这款酒987');await count(0);
    await page.getByRole('button',{name:'清除筛选',exact:true}).click();await count(counts.world);
    const beer=source.world.beers[0];await page.getByLabel('搜索酒款酒厂或国家').fill(beer.name);await page.getByRole('heading',{name:beer.name,exact:true}).waitFor();await page.getByLabel('清空搜索').click();await count(counts.world);
  });
  await check('Brewery tray starts with 24 bottles, loads the rest and opens source-backed detail',async()=>{
    await nav(0);await choose('archive');await settle();await clickExposed('.globe-bottle-count');await page.locator('.brewery-tray').waitFor();assert.equal(await page.locator('.tray-bottles>button').count(),Math.min(24,counts.archive));
    for(let shown=24;shown<counts.archive;shown+=24){await page.locator('.tray-more').click();await page.waitForFunction(n=>document.querySelectorAll('.tray-bottles>button').length===n,Math.min(shown+24,counts.archive));}
    assert.equal(await page.locator('.tray-more').count(),0);assert.deepEqual(await page.locator('.tray-bottles>button>span').allTextContents(),source.archive.beers.map(b=>b.name));
    await page.locator('.tray-bottles>button').first().click();await page.locator('.inspector h2').waitFor();assert.equal(await page.locator('.inspector h2').innerText(),source.archive.beers[0].name);
    await page.locator('.source-details summary').click();assert(await page.locator('.source-details a').count()>0);assert.match(await page.locator('.source-details').innerText(),/历史|DIY Dog/);
    await closeDetail();await page.getByLabel('关闭酒厂酒款').click();assert.equal(await page.locator('.brewery-tray').count(),0);
  });
  await check('Favorites survive reload and appear in saved navigation',async()=>{
    await nav(1);await choose('world');await page.locator('.beer-card-main').first().click();const name=await page.locator('.inspector h2').innerText();await page.getByLabel('收藏当前酒款',{exact:true}).click();await closeDetail();
    await page.reload();await ready();await nav(2);await count(1);assert.equal(await page.locator('.beer-card h3').innerText(),name);assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('brew-atlas-saved')))).length,1);
  });
  await check('Two-beer archive comparison and combined library respect current dataset counts',async()=>{
    await nav(1);await choose('archive');await count(counts.archive);
    for(let i=0;i<2;i++){await page.locator('.beer-card-main').nth(i).click();await page.getByRole('button',{name:'加入对比',exact:true}).click();await closeDetail();}
    await page.locator('.compare-dock').getByRole('button',{name:'对比',exact:true}).click();assert.equal(await page.locator('dialog[open] .comparison>div').count(),2);assert((await page.locator('dialog[open] .country-label').allTextContents()).every(s=>s.includes('历史配方')));await shot('comparison');
    await page.locator('dialog[open]').getByLabel('关闭窗口').click();await page.getByLabel('清空对比').click();await choose('all');await count(counts.all);await shot('library');
  });
  await check('Shared archive beer URL opens the correct beer',async()=>{
    const beer=source.archive.beers.find(b=>b.id==='archive-366')||source.archive.beers[0];await page.goto(`${base}/?beer=${encodeURIComponent(beer.id)}`);await ready();await page.locator('.inspector h2').waitFor();assert.equal(await page.locator('.inspector h2').innerText(),beer.name);assert.match(await page.locator('.inspector-top').innerText(),/历史配方/);await closeDetail();
  });
  await check('OpenBeer library paginates all source records without duplicate or missing page boundaries',async()=>{
    await nav(1);await choose('openbeer');await count(counts.openbeer);await range(1,PAGE_SIZE);
    assert.deepEqual(await cardNames(),source.openbeer.beers.slice(0,PAGE_SIZE).map(b=>b.name));assert(await page.getByLabel('上一页',{exact:true}).isDisabled());
    assert.equal(await page.locator('.catalog-card').count(),PAGE_SIZE);assert.equal(await page.locator('.beer-card img').count(),0);assert.equal(await page.locator('.beer-card .image-fallback').count(),PAGE_SIZE);
    await page.getByLabel('下一页',{exact:true}).click();await range(PAGE_SIZE+1,PAGE_SIZE*2);await count(counts.openbeer,page,1);assert.deepEqual(await cardNames(),source.openbeer.beers.slice(PAGE_SIZE,PAGE_SIZE*2).map(b=>b.name));
    await page.getByLabel('上一页',{exact:true}).click();await range(1,PAGE_SIZE);assert.deepEqual(await cardNames(),source.openbeer.beers.slice(0,PAGE_SIZE).map(b=>b.name));
    await page.getByLabel('下一页',{exact:true}).click();await range(PAGE_SIZE+1,PAGE_SIZE*2);
    const countries=[...new Set(source.openbeer.beers.map(b=>breweryById.get(b.breweryId).country))],country=countries.find(country=>{const n=source.openbeer.beers.filter(b=>breweryById.get(b.breweryId).country===country).length;return n>PAGE_SIZE&&n<PAGE_SIZE*3&&n%PAGE_SIZE;});assert(country,'A country fixture with a partial final page');
    const expected=source.openbeer.beers.filter(b=>breweryById.get(b.breweryId).country===country);await filters();await page.getByLabel('按国家或地区筛选').selectOption(country);await count(expected.length);await range(1,PAGE_SIZE);await page.getByLabel('更多筛选',{exact:true}).click();
    for(let i=0;i<Math.ceil(expected.length/PAGE_SIZE);i++){if(i)await page.getByLabel('下一页',{exact:true}).click();await count(expected.length,page,i);await range(i*PAGE_SIZE+1,Math.min((i+1)*PAGE_SIZE,expected.length));assert.deepEqual(await cardNames(),expected.slice(i*PAGE_SIZE,(i+1)*PAGE_SIZE).map(b=>b.name));}
    assert(await page.getByLabel('下一页',{exact:true}).isDisabled());await shot('openbeer-country');await page.locator('.reset-filter').click();await count(counts.openbeer);await range(1,PAGE_SIZE);
  });
  await check('OpenBeer photo, location and ABV filters respect missing values and reset pagination',async()=>{
    await filters();await page.getByLabel('只看有实物图').check();await count(0);assert.equal(await page.locator('.beer-card img').count(),0);await page.getByLabel('只看有实物图').uncheck();await count(counts.openbeer);
    await page.getByLabel('只看可定位酒款').check();await count(source.openbeer.beers.filter(b=>located(breweryById.get(b.breweryId))).length);await page.getByLabel('只看可定位酒款').uncheck();await count(counts.openbeer);
    const thresholds={light:n=>n<=4.5,balanced:n=>n>4.5&&n<=7,strong:n=>n>7};
    for(const [value,predicate] of Object.entries(thresholds)){await filters();await page.getByLabel('按酒精度筛选').selectOption(value);const expected=source.openbeer.beers.filter(b=>typeof b.abv==='number'&&predicate(b.abv));await count(expected.length);await range(1,Math.min(PAGE_SIZE,expected.length));assert.deepEqual(await cardNames(),expected.slice(0,PAGE_SIZE).map(b=>b.name));assert.equal(await page.locator('.beer-card .missing-value').count(),0);}
    await page.locator('.reset-filter').click();await count(counts.openbeer);assert((await page.locator('.flavor-chips button').allTextContents()).includes('全部风味'));assert.equal(await page.locator('.flavor-chips button:not(:first-child):enabled').count(),0);
    await page.getByLabel('下一页',{exact:true}).click();await range(PAGE_SIZE+1,PAGE_SIZE*2);const term='(512) Brewing Company',expected=source.openbeer.beers.filter(b=>breweryById.get(b.breweryId).name===term);assert(expected.length>0&&expected.length<PAGE_SIZE);await page.getByLabel('搜索酒款酒厂或国家').fill(term);await count(expected.length);await range(1,expected.length);assert.deepEqual(await cardNames(),expected.map(b=>b.name));await page.getByLabel('清空搜索').click();await count(counts.openbeer);await range(1,PAGE_SIZE);
  });
  await check('An unlocated OpenBeer deep link preserves unknown data, provenance and favorites',async()=>{
    const beer=source.openbeer.beers.find(b=>b.abv===null&&!located(breweryById.get(b.breweryId)));assert(beer);await page.goto(`${base}/?beer=${encodeURIComponent(beer.id)}`);await ready();await page.locator('.inspector h2').waitFor();assert.equal(await page.locator('.inspector h2').innerText(),beer.name);
    assert.match(await page.locator('.inspector-top').innerText(),/OPEN BEER.*2010.*2011/);assert.match(await page.locator('.inspector-hero .image-fallback').innerText(),/暂无实物图/);assert.equal(await page.locator('.inspector-hero img').count(),0);assert.equal(await page.locator('.beer-stats>div').first().locator('strong').innerText(),'未提供');assert.equal(await page.locator('.detail-flavors button').count(),0);assert.match(await page.locator('.catalog-note').innerText(),/精酿属性未核验.*暂无结构化风味/);
    await page.locator('.source-details summary').click();assert.match(await page.locator('.source-details').innerText(),/历史啤酒目录.*未核验精酿/);assert((await page.locator('.source-details a').evaluateAll(nodes=>nodes.map(n=>n.href))).includes(beer.sourceUrls[0]));
    await page.locator('.detail-tabs').getByRole('button',{name:'酒厂',exact:true}).click();assert.match(await page.locator('.location-note').innerText(),/来源未提供可用位置/);assert(await page.getByRole('button',{name:'在地图上查看',exact:true}).isDisabled());assert.doesNotMatch(await page.locator('.inspector').innerText(),/NaN|undefined/);await shot('openbeer-missing-detail');
    await page.getByLabel('收藏当前酒款',{exact:true}).click();await closeDetail();await nav(2);await count(2);assert((await cardNames()).includes(beer.name));assert((await page.evaluate(()=>JSON.parse(localStorage.getItem('brew-atlas-saved')))).includes(beer.id));
    await page.reload();await ready();await closeDetail();await nav(2);await count(2);assert((await cardNames()).includes(beer.name));
  });
  await check('Phone first view, ABV selection, library detail, dismissal and dynamic about counts',async()=>{
    await layout('mobile',390,844);await choose('world');await settle();await page.getByLabel('更多筛选',{exact:true}).click();await page.getByLabel('按酒精度筛选').selectOption('light');
    const expected=source.world.beers.filter(b=>typeof b.abv==='number'&&b.abv<=4.5).length;assert(expected>0);await page.waitForFunction(n=>Number(document.querySelector('.map-summary strong')?.textContent.replaceAll(',',''))===n,expected);
    await page.locator('.reset-filter').click();await nav(1);await count(counts.world);await page.locator('.beer-card-main').first().click();assert(await page.locator('.inspector').isVisible());await shot('mobile-detail');await closeDetail();assert.equal(await page.locator('.inspector').count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByLabel('关于数据与使用方法').click();assert.deepEqual((await page.locator('dialog[open] .about-stats b').allTextContents()).map(integer),[counts.all,counts.locatedBreweries,counts.countries]);assert.match(await page.locator('dialog[open]').innerText(),/2010.*2011/);assert.match(await page.locator('dialog[open]').innerText(),/未核验精酿/);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
  });
  await check('Phone catalog pagination and missing-photo detail stay usable without overflow',async()=>{
    await choose('openbeer');await count(counts.openbeer);await page.getByLabel('下一页',{exact:true}).click();await count(counts.openbeer,page,1);await range(PAGE_SIZE+1,PAGE_SIZE*2);assert.deepEqual(await cardNames(),source.openbeer.beers.slice(PAGE_SIZE,PAGE_SIZE*2).map(b=>b.name));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await filters();await page.getByLabel('按国家或地区筛选').selectOption('Japan');const japanese=source.openbeer.beers.filter(b=>breweryById.get(b.breweryId).country==='Japan');await count(japanese.length);await page.getByLabel('更多筛选',{exact:true}).click();await range(1,Math.min(japanese.length,PAGE_SIZE));await page.locator('.beer-card-main').first().click();assert.match(await page.locator('.inspector-hero .image-fallback').innerText(),/暂无实物图/);await shot('mobile-openbeer-detail');await closeDetail();await shot('mobile-openbeer-library');
  });
  await check('Every supplied local image decodes; unavailable catalog images stay absent',async()=>{
    assert.equal(pictured.length,source.world.beers.length+source.archive.beers.length+source.off.beers.length,'All three pictured collections retained');
    assert(source.openbeer.beers.every(b=>b.image===null),'Do not replace unknown photos with invented bottles');
    for(const beer of pictured)assert.equal(new URL(beer.image,base).origin,origin,`${beer.id}: remote image`);
    const decoded=await page.evaluate(async beers=>{let i=0,active=0,peak=0;const results=[];await Promise.all(Array.from({length:Math.min(12,beers.length)},async()=>{while(i<beers.length){const beer=beers[i++],im=new Image();let timer;active++;peak=Math.max(peak,active);try{im.src=beer.image;await Promise.race([im.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),20000);})]);results.push({id:beer.id,ok:im.naturalWidth>0&&im.naturalHeight>0});}catch(e){results.push({id:beer.id,ok:false,error:String(e)});}finally{clearTimeout(timer);im.src='';active--;}}}));return {results,peak};},pictured.map(({id,image})=>({id,image})));
    assert.equal(decoded.results.length,counts.pictured);assert(decoded.peak<=12);assert.deepEqual(decoded.results.filter(x=>!x.ok),[]);results.push({name:'Image decoder counts',passed:true,images:decoded.results.length,peak:decoded.peak,unavailable:all.length-pictured.length});
  });
  await check('WebGL fallback retains clickable actual bottle photos and brewery trays',async()=>{
    const fallback=await context.newPage();await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return ['webgl2','webgl','experimental-webgl'].includes(type)?null:original.call(this,type,...args);};});
    await fallback.goto(base);await ready(fallback);await fallback.getByRole('img',{name:'世界精酿酒厂平面地图',exact:true}).waitFor();await choose('world',fallback);await settle(fallback);assert.equal(await fallback.locator('.inspector').count(),0);await shot('fallback-map',fallback);
    const label=await clickExposed('.globe-flat-map .globe-bottle[data-cluster="false"]',fallback);await fallback.locator('.inspector h2').waitFor();assert.equal(`查看 ${await fallback.locator('.inspector h2').innerText()}`,label);await closeDetail(fallback);await clickExposed('.globe-flat-map .globe-bottle-marker[data-cluster="false"] .globe-bottle-count',fallback);await fallback.locator('.brewery-tray').waitFor();assert(await fallback.locator('.tray-bottles>button').count()>0);await fallback.getByLabel('关闭酒厂酒款').click();
    await fallback.setViewportSize({width:390,height:844});await choose('openbeer',fallback);await settle(fallback);assert.equal(await fallback.locator('.globe-flat-map img').count(),0);const markers=await fallback.locator('.globe-site-marker').count();assert(markers>0);await checkMapGeometry(fallback);
    const clusters=fallback.locator('.globe-site-dot[data-cluster="true"]');assert(await clusters.count()>0,'Large catalog groups nearby locations');await clickExposed('.globe-site-dot[data-cluster="true"]',fallback);await fallback.waitForTimeout(600);await checkMapGeometry(fallback);
    await fallback.getByLabel('搜索酒款酒厂或国家').fill('(512) Brewing Company');await settle(fallback);assert.equal(await fallback.locator('.globe-site-dot[data-cluster="false"]').count(),1);await clickExposed('.globe-site-dot[data-cluster="false"]',fallback);await fallback.locator('.brewery-tray').waitFor();assert(await fallback.locator('.tray-bottles>button').count()>0);assert.equal(await fallback.locator('.tray-bottles img').count(),0);await fallback.locator('.tray-bottles>button').first().click();await fallback.locator('.inspector .image-fallback').first().waitFor();await closeDetail(fallback);await fallback.getByLabel('关闭酒厂酒款').click();await shot('mobile-openbeer-fallback',fallback);
    const unlocated=source.openbeer.breweries.find(b=>!located(b)&&source.openbeer.beers.some(beer=>beer.breweryId===b.id));assert(unlocated);await fallback.getByLabel('搜索酒款酒厂或国家').fill(unlocated.name);await fallback.getByText('这些记录暂未提供位置',{exact:true}).waitFor();await fallback.getByRole('button',{name:'在酒库查看',exact:true}).click();assert(await fallback.locator('.catalog-card').count()>0);await fallback.close();
  });
  assert.deepEqual(errors,[],'Browser page errors');assert.deepEqual(external,[],'External requests attempted');
}catch(error){results.push({name:'Failure',passed:false,error:error.stack});try{await shot('failure');}catch{await page.screenshot({path:path.join(root,'qa','failure.png'),fullPage:false});}process.exitCode=1;console.error(error);}
finally{await writeFile(path.join(root,'qa','results.json'),JSON.stringify({testedAt:new Date().toISOString(),browser:await browser.version(),base,sourceCounts:counts,externalRequests:external,browserErrors:errors,layouts,results},null,2));await browser.close();}
