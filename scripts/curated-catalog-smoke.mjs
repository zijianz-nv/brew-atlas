import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';

// Run only after the curated data and production build have been declared ready.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'qa');
const base=process.env.DEMO_URL||'http://127.0.0.1:4173',origin=new URL(base).origin;
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname));
const runtime=createRequire(`${process.env.HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json`),{chromium}=runtime('playwright');
const oldCollections=['beertasting','off','world','archive','openbeer'],collections=['all','awards','representative','pictured'];
const report={startedAt:new Date().toISOString(),base,policy:'Independent real Chrome; block all external HTTP. Browser data requests must exclusively load /data/catalog.json. Real product records and UI; no fabricated beers or positions. Report partial counts honestly.',checks:[],states:[],details:[],screenshots:[],skips:[],dataRequests:[],imageRequests:[],external:[],errors:[],localErrors:[]};
let browser,page,data,byBeer,byBrewery,active='initialize';
const oldIds=new Set();
const located=b=>b?.locationVerified===true&&Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180;
const members=c=>data.beers.filter(b=>c==='all'||c==='pictured'&&hasDescribedPhoto(b)||b.collection===c||b.collections?.includes(c));
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
function measureImage(img){
 const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
 return{src:img.getAttribute('src'),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,complete:img.complete,fit:getComputedStyle(img).objectFit,contentFit:img.closest('[data-content-fit]')?.dataset.contentFit==='true',imageRect:rect(img),frameRect:rect(img.parentElement)};
}
function assertCompleteImage(r,beer,label){
 assert(r.complete&&r.naturalWidth>0&&r.src.startsWith('/'),`${label}: local decode failed`);
 const frame=r.frameRect,img=r.imageRect;
 if(r.contentFit){
  const meta=beer.imageContentBounds,b=meta?.bounds;assert(b,`${label}: content fit has no source bounds`);
  const sx=img.width/meta.width,sy=img.height/meta.height;assert(Math.abs(sx-sy)<=Math.max(sx,sy)*.008+.0001,`${label}: content image stretched`);
  const visible={left:img.left+b.x*sx,top:img.top+b.y*sy,right:img.left+(b.x+b.width)*sx,bottom:img.top+(b.y+b.height)*sy};
  assert(visible.left>=frame.left-1&&visible.right<=frame.right+1&&visible.top>=frame.top-1&&visible.bottom<=frame.bottom+1,`${label}: nontransparent product pixels clipped`);
  r.projectedContentRect=visible;r.sourceContentBounds=meta;
 }else{
  assert.equal(r.fit,'contain');assert(img.left>=frame.left-1&&img.right<=frame.right+1&&img.top>=frame.top-1&&img.bottom<=frame.bottom+1,`${label}: image escaped frame`);
 }
 return r;
}
async function check(name,fn,{continueOnFailure=false}={}){active=name;try{await fn();report.checks.push({name,passed:true});console.log(`PASS ${name}`)}catch(error){if(!continueOnFailure)throw error;report.checks.push({name,passed:false,message:error.message});console.error(`FAIL ${name}: ${error.message}`)}}
async function shot(name){await page.mouse.move(0,0);const file=path.join(out,`curated-v2-${name}.png`);await page.screenshot({path:file});report.screenshots.push(file)}
async function settle(map=false){if(map)await page.waitForFunction(()=>document.querySelector('.brew-globe-view')?._landMask);await page.waitForTimeout(map?1800:200)}
async function ownedContext(viewport){
 const ctx=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:viewport.width<500,hasTouch:viewport.width<500,reducedMotion:'reduce'});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(/^https?:$/.test(u.protocol)&&u.origin!==origin){report.external.push({case:active,url:u.href});return r.abort()}return r.continue()});
 await ctx.addInitScript(ids=>{localStorage.setItem('brew-atlas-saved',JSON.stringify(ids));localStorage.removeItem('brew-atlas-curated-saved-v1')},[...oldIds]);
 const p=await ctx.newPage();p.setDefaultTimeout(18000);
 p.on('pageerror',e=>report.errors.push({case:active,message:e.message}));
 p.on('request',r=>{const u=new URL(r.url());if(u.origin!==origin)return;if(/^\/data\/.*\.json$/.test(u.pathname))report.dataRequests.push({case:active,path:u.pathname});if(r.resourceType()==='image')report.imageRequests.push(u.pathname)});
 p.on('response',r=>{if(new URL(r.url()).origin===origin&&r.status()>=400)report.localErrors.push({case:active,url:r.url(),status:r.status()})});
 return{ctx,page:p};
}
async function boot(query=''){
 const rp=page.waitForResponse(r=>new URL(r.url()).pathname==='/data/catalog.json');await page.goto(`${base}/${query}`,{waitUntil:'domcontentloaded'});
 const response=await rp;assert(response.ok(),`Catalog HTTP ${response.status()}`);const loaded=await response.json();
 await page.getByLabel('选择数据集',{exact:true}).waitFor();
 if(!data){data=loaded;assert(Array.isArray(data.beers)&&data.beers.length>0);assert(Array.isArray(data.breweries));byBeer=new Map(data.beers.map(b=>[b.id,b]));byBrewery=new Map(data.breweries.map(b=>[b.id,b]));assert.equal(byBeer.size,data.beers.length);
  assert(data.beers.every(b=>['awards','representative'].includes(b.collection)&&byBrewery.has(b.breweryId)),'Legacy membership or absent brewery');
  assert.equal(data.metadata.schemaVersion,2);assert.equal(data.metadata.id,'awards-representative-v1');
  report.data={beers:data.beers.length,breweries:data.breweries.length,awards:members('awards').length,representative:members('representative').length,pictured:members('pictured').length,mappedBreweries:data.breweries.filter(located).length,metadata:data.metadata};
  for(const [key,n]of Object.entries({beers:data.beers.length,breweries:data.breweries.length,awardsBeers:members('awards').length,representativeBeers:members('representative').length,picturedBeers:members('pictured').length}))assert.equal(data.metadata.counts[key],n,`Metadata ${key}`);
 }else assert.deepEqual(loaded.beers.map(b=>b.id),data.beers.map(b=>b.id),'Data changed during QA');
 const options=await page.getByLabel('选择数据集',{exact:true}).locator('option').evaluateAll(ns=>ns.map(n=>n.value));assert.deepEqual(options.sort(),[...collections].sort());
 const build=await page.locator('script[type=module]').getAttribute('src');if(report.build)assert.equal(build,report.build);report.build=build;
}
async function choose(c){await page.getByLabel('选择数据集',{exact:true}).selectOption(c);await settle()}
async function library(){await page.getByRole('button',{name:'酒库',exact:true}).click();await page.locator('.library-heading').waitFor();await settle()}
async function cardIds(){return page.locator('.beer-card').evaluateAll(ns=>ns.map(n=>n.dataset.beerId))}
async function assertLibrary(c){
 const expected=members(c),text=await page.locator('.library-heading').innerText(),match=text.match(/([\d,，]+)\s*条记录/);assert(match,`No actual count: ${text}`);assert.equal(Number(match[1].replace(/[,，]/g,'')),expected.length);
 const cards=await page.locator('.beer-card').evaluateAll(ns=>ns.map(n=>({id:n.dataset.beerId,images:n.querySelectorAll('.card-image img').length})));assert.equal(cards.length,Math.min(60,expected.length));
 for(const card of cards){assert(expected.some(b=>b.id===card.id),`Unexpected card ${card.id}`);assert.equal(card.images,hasDescribedPhoto(byBeer.get(card.id))?1:0)}
 return{collection:c,count:expected.length,firstPage:cards.map(c=>c.id)};
}
async function openBeer(beer){
 await choose('all');await library();await page.getByLabel('搜索酒款酒厂或国家',{exact:true}).fill(beer.name);await settle();
 const cards=page.locator('.beer-card'),i=await cards.evaluateAll((ns,id)=>ns.findIndex(n=>n.dataset.beerId===id),beer.id);assert(i>=0,`Exact search missing ${beer.id}`);
 await cards.nth(i).locator('.beer-card-main').click();await page.locator('.inspector').waitFor();assert.equal(await page.locator('.inspector').getAttribute('data-beer-id'),beer.id);assert.equal((await page.locator('.inspector h2').innerText()).trim(),beer.name.trim());
}
async function closeBeer(){if(await page.locator('.inspector').count())await page.getByLabel('关闭酒款详情',{exact:true}).click()}
async function imageFrame(){
 await page.waitForFunction(()=>{const i=document.querySelector('.inspector-hero .beer-photo img');return i?.complete&&i.naturalWidth>0});
 const r=await page.locator('.inspector-hero .beer-photo img').evaluate(measureImage),id=await page.locator('.inspector').getAttribute('data-beer-id');
 return assertCompleteImage(r,byBeer.get(id),'detail');
}
async function mapState(name){
 await settle(true);const s=await page.evaluate(()=>{
  const w=document.querySelector('.brew-globe-view'),wr=w.getBoundingClientRect();
  const shown=n=>{const r=n.getBoundingClientRect();if(!r.width||!r.height)return false;for(let a=n;a;a=a.parentElement){const c=getComputedStyle(a);if(c.display==='none'||c.visibility==='hidden'||+c.opacity===0)return false}return true};
  const rect=n=>{const r=n.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  return{photos:[...w.querySelectorAll('.globe-bottle')].filter(shown).map(n=>{const r=rect(n),i=n.querySelector('img');return{id:n.dataset.beerId,rect:r,src:i?.getAttribute('src'),ready:Boolean(i?.complete&&i.naturalWidth>0),image:i&&{src:i.getAttribute('src'),naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,complete:i.complete,fit:getComputedStyle(i).objectFit,contentFit:i.closest('[data-content-fit]')?.dataset.contentFit==='true',imageRect:rect(i),frameRect:rect(i.parentElement)},land:w._landMask.intersectsRect({left:r.left-wr.left,right:r.right-wr.left,top:r.top-wr.top,bottom:r.bottom-wr.top})}}),allMapIds:[...w.querySelectorAll('.globe-bottle')].map(n=>n.dataset.beerId),mode:w.dataset.mapMode,zoom:w.dataset.zoomScale,controls:[...document.querySelectorAll('.topbar,.map-summary,.globe-tools,.map-hint,.filter-dock,.inspector,.brewery-tray')].filter(shown).map(rect),width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth};
 });
 const c=await page.getByLabel('选择数据集',{exact:true}).inputValue(),allowed=new Set(members(c).map(b=>b.id));
 for(const id of s.allMapIds){const b=byBeer.get(id);assert(b&&allowed.has(id),`${name}: wrong collection ${id}`);assert(hasDescribedPhoto(b)&&located(byBrewery.get(b.breweryId)),`${name}: incomplete/unverified map beer ${id}`)}
 for(const p of s.photos){assert(p.land,`${name}: image rectangle has no land intersection`);assert(p.ready&&p.src.startsWith('/'),`${name}: local image not decoded`);assertCompleteImage(p.image,byBeer.get(p.id),`${name}: map`);assert(p.rect.left>=-.5&&p.rect.right<=s.width+.5&&p.rect.top>=-.5&&p.rect.bottom<=s.height+.5);for(const o of s.controls)assert(overlap(p.rect,o)<=1,`${name}: control overlap`)}
 for(let i=0;i<s.photos.length;i++)for(let j=0;j<i;j++)assert(overlap(s.photos[i].rect,s.photos[j].rect)<=1,`${name}: photo overlap`);
 assert(s.documentWidth<=s.width+1,`${name}: horizontal overflow`);report.states.push({name,collection:c,visiblePhotos:s.photos.length,...s});return s;
}

try{
 await mkdir(out,{recursive:true});
 // Local fixture reads identify real legacy saved IDs without requesting old HTTP endpoints.
 for(const c of oldCollections){try{const old=JSON.parse(await readFile(path.join(root,'public/data',`${c}.json`),'utf8'));if(old.beers?.[0]?.id)oldIds.add(old.beers[0].id)}catch(e){if(e.code!=='ENOENT')throw e}}
 if(!oldIds.size)oldIds.add('brewdog-archive-1');
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const d of[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844},{name:'tablet',width:1024,height:768}]){
  const owned=await ownedContext({width:d.width,height:d.height});page=owned.page;
  try{
   await boot();
   await check(`${d.name}: curated home and verified map`,async()=>{assert.equal(await page.getByLabel('选择数据集',{exact:true}).inputValue(),'all');const home=await mapState(`${d.name}-home`);await shot(`${d.name}-home`);await page.getByLabel('重置地球视角',{exact:true}).click();const reset=await mapState(`${d.name}-reset`);assert(home.photos.length>0,`${d.name}: empty first map view`);assert(reset.photos.length>0,`${d.name}: empty reset view`)},{continueOnFailure:true});
   await check(`${d.name}: legacy saved items do not leak`,async()=>{
    await page.getByRole('button',{name:'想尝',exact:true}).click();await settle();assert.deepEqual(await cardIds(),[]);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('brew-atlas-curated-saved-v1')||'[]')),[]);
   });
   await library();
   await check(`${d.name}: collections and pagination match actual catalog`,async()=>{
    for(const c of collections){await choose(c);report.states.push({name:`${d.name}-${c}-library`,...await assertLibrary(c)});if(c==='awards')await shot(`${d.name}-awards-library`);
     if(c==='pictured'){
      const images=page.locator('.beer-card .card-image img'),decoded=[];
      // Decode every pictured card on this real page (the library caps pages at 60).
      for(let i=0;i<await images.count();i++){await images.nth(i).scrollIntoViewIfNeeded();await images.nth(i).evaluate(img=>img.decode());const id=await images.nth(i).evaluate(img=>img.closest('.beer-card').dataset.beerId),r=await images.nth(i).evaluate(measureImage);assertCompleteImage(r,byBeer.get(id),`${d.name}: card ${id}`);decoded.push({id,...r})}
      report.states.push({name:`${d.name}-pictured-decoded`,images:decoded});await page.locator('.library-content').evaluate(n=>n.scrollTo({top:0}));await shot(`${d.name}-pictured-library`);
     }
    }
    await choose('all');if(data.beers.length>60){const first=await cardIds();await page.getByLabel('下一页',{exact:true}).first().click();await settle();const second=await cardIds();assert(second.length>0&&second.every(id=>!first.includes(id)));await page.getByLabel('上一页',{exact:true}).first().click();await settle();assert.deepEqual(await cardIds(),first)}else report.skips.push({device:d.name,check:'second page',reason:`Only ${data.beers.length} real entries`});
   });
   await check(`${d.name}: award year, source and annual rating`,async()=>{
    const beer=members('awards').find(b=>b.awards?.some(a=>Number.isFinite(a.rating)&&a.ratingYear));assert(beer,'No real award fixture');await openBeer(beer);
    assert.equal(beer.rating,null,'Annual score stored as a timeless rating');assert.equal(beer.ratingsCount,null,'Unpublished award rating count invented');
    const rendered=await page.locator('.inspector .award-record').evaluateAll(ns=>ns.map(n=>({year:n.dataset.ratingYear,text:n.innerText,links:[...n.querySelectorAll('a')].map(a=>a.href)})));assert(rendered.length>0);
    for(const a of beer.awards)assert(rendered.some(r=>String(r.year)===String(a.ratingYear)&&(a.rating==null||r.text.includes(Number(a.rating).toFixed(2)))&&(!a.sourceUrl||r.links.includes(a.sourceUrl))),`Wrong award detail ${JSON.stringify(a)}`);
    const text=await page.locator('.inspector').innerText();assert(!/\b50\s*(?:条评价|人评分)/.test(text));
    report.details.push({device:d.name,beerId:beer.id,awards:beer.awards,rendered});await shot(`${d.name}-award-detail`);await closeBeer();
   });
   await check(`${d.name}: enriched pictured awards retain annual ratings and intact images`,async()=>{
    const enriched=members('awards').filter(hasDescribedPhoto);assert(enriched.length>0);
    for(const beer of enriched.slice(0,24)){
     await openBeer(beer);const image=await imageFrame();assert.equal(beer.rating,null);assert.equal(beer.ratingsCount,null);
     const rendered=await page.locator('.inspector .award-record').evaluateAll(ns=>ns.map(n=>({year:n.dataset.ratingYear,text:n.innerText,links:[...n.querySelectorAll('a')].map(a=>a.href)})));
     for(const a of beer.awards)assert(rendered.some(r=>String(r.year)===String(a.ratingYear)&&(a.rating==null||r.text.includes(Number(a.rating).toFixed(2)))&&(!a.sourceUrl||r.links.includes(a.sourceUrl))),`Enrichment changed displayed award ${beer.id}`);
     if(beer.abv!=null)assert((await page.locator('.inspector').innerText()).includes(String(beer.abv)),`Missing verified ABV ${beer.id}`);
     report.details.push({device:d.name,beerId:beer.id,check:'enriched_award',awards:beer.awards,rendered,image});
     if(beer.id==='curated-award-1196102'||beer.id==='curated-award-2953998')await shot(`${d.name}-enriched-${beer.id}`);
     await closeBeer();
    }
    report.states.push({name:`${d.name}-enriched-awards`,count:enriched.length,checked:enriched.slice(0,24).map(b=>b.id)});
   });
   await check(`${d.name}: missing image and location remain honest`,async()=>{
    const noPhoto=data.beers.find(b=>!hasDescribedPhoto(b));if(noPhoto){await openBeer(noPhoto);assert.equal(await page.locator('.inspector-hero img').count(),0);assert.match(await page.locator('.inspector-hero').innerText(),/暂无|待补|未提供/);await closeBeer()}else report.skips.push({device:d.name,check:'missing photo',reason:'No actual missing-photo record'});
    const noLocation=data.beers.find(b=>!located(byBrewery.get(b.breweryId)));if(noLocation){await openBeer(noLocation);await page.locator('.detail-tabs').getByRole('button',{name:'酒厂',exact:true}).click();assert(await page.getByRole('button',{name:/在地图上查看/}).isDisabled());assert.match(await page.locator('.location-note').innerText(),/未|待|未知/);await shot(`${d.name}-unmapped-detail`);await closeBeer()}else report.skips.push({device:d.name,check:'missing location',reason:'All real locations verified'});
   });
   await check(`${d.name}: representative search and intact local image`,async()=>{
    const beer=members('representative').find(hasDescribedPhoto)||members('pictured')[0]||members('representative')[0];assert(beer,'No real representative fixture');await openBeer(beer);
    if(hasDescribedPhoto(beer))report.details.push({device:d.name,beerId:beer.id,image:await imageFrame()});else report.skips.push({device:d.name,check:'representative image',reason:'No completed representative photo yet'});
    await shot(`${d.name}-representative-detail`);await closeBeer();
    await page.getByRole('button',{name:'地球',exact:true}).click();await choose('pictured');await mapState(`${d.name}-pictured`);await shot(`${d.name}-pictured`);
   });
   await check(`${d.name}: one merged awarded representative works in both collections and map`,async()=>{
    const beer=members('awards').find(b=>members('representative').some(r=>r.id===b.id)&&hasDescribedPhoto(b)&&located(byBrewery.get(b.breweryId)));
    if(!beer){report.skips.push({device:d.name,check:'dual collection',reason:'No merged awarded photographed representative in this catalog'});return}
    for(const c of['awards','representative']){await library();await choose(c);await page.getByLabel('搜索酒款酒厂或国家',{exact:true}).fill(beer.name);await settle();assert((await cardIds()).includes(beer.id),`Merged beer absent from ${c}`)}
    await openBeer(beer);assert(await page.locator('.inspector .award-record').count()>0);report.details.push({device:d.name,beerId:beer.id,mergedCollections:beer.collections,image:await imageFrame()});
    await page.locator('.detail-tabs').getByRole('button',{name:'酒厂',exact:true}).click();assert(await page.getByRole('button',{name:/在地图上查看/}).isEnabled());await page.getByRole('button',{name:/在地图上查看/}).click();
    let s=await mapState(`${d.name}-merged-award-map`);for(let attempt=0;!s.photos.some(p=>p.id===beer.id)&&attempt<2;attempt++){await page.getByLabel('放大地球',{exact:true}).click();s=await mapState(`${d.name}-merged-award-map-zoom-${attempt+1}`)}
    assert(s.photos.some(p=>p.id===beer.id),'Merged photographed award cannot be seen after real map focus and two zooms');await shot(`${d.name}-merged-award-map`);
   });
   await check(`${d.name}: real country filter does not leave unrelated map bottles`,async()=>{
    const beer=members('pictured').find(b=>located(byBrewery.get(b.breweryId))&&byBrewery.get(b.breweryId).country);
    if(!beer){report.skips.push({device:d.name,check:'country map filter',reason:'No actual mapped photographed beer yet'});return}
    const brewery=byBrewery.get(beer.breweryId);await page.getByRole('button',{name:'酒厂与地区',exact:true}).click();
    await page.getByLabel('按国家或地区筛选',{exact:true}).selectOption(brewery.country);await page.getByRole('button',{name:'收起筛选',exact:true}).click();
    const s=await mapState(`${d.name}-country-filter`);for(const id of s.allMapIds)assert.equal(byBrewery.get(byBeer.get(id).breweryId).country,brewery.country);
    await shot(`${d.name}-country-filter`);await choose('all');
   });
   await check(`${d.name}: partial collection is not called 1,000 complete`,async()=>{
    await page.getByLabel('关于数据与使用方法',{exact:true}).click();const text=await page.locator('dialog[open]').innerText();
    assert(!/BeerTasting 试采|BrewDog 历史配方|2010[–—-]2011/.test(text),'Legacy about text');
    if(members('representative').length<1000){assert.equal(data.metadata.partial,true);assert.equal(data.metadata.targetRepresentativeCount,1000);assert(!/(?:已完成|已收录|已精选)\s*1[,.，]?000|1[,.，]?000\s*款.{0,5}(?:已完成|全部就绪)/.test(text));assert(/首批|候选|目标|待补|继续|部分|批次|持续整理|当前实际收录/.test(text),'Partial status is not explained')}
    report.states.push({name:`${d.name}-about`,text});await page.locator('dialog[open]').getByLabel('关闭窗口',{exact:true}).click();
   });
  }catch(e){await shot(`${d.name}-failure`).catch(()=>{});throw e}finally{await owned.ctx.close()}
 }
 for(const c of oldCollections){
  const owned=await ownedContext({width:1024,height:768});page=owned.page;
  try{await check(`Legacy ${c} URL and beer ID do not restore old catalogs`,async()=>{const id=[...oldIds].find(id=>!byBeer.has(id))||'brewdog-archive-1';await boot(`?collection=${encodeURIComponent(c)}&beer=${encodeURIComponent(id)}`);assert.equal(await page.getByLabel('选择数据集',{exact:true}).inputValue(),'all');assert.equal(await page.locator('.inspector').count(),0);await library();await assertLibrary('all')})}catch(e){await shot(`legacy-${c}-failure`).catch(()=>{});throw e}finally{await owned.ctx.close()}
 }
 await check('Catalog-only data requests, no external traffic or browser errors',async()=>{assert(report.dataRequests.length>0);assert.deepEqual([...new Set(report.dataRequests.map(r=>r.path))],['/data/catalog.json']);assert.deepEqual(report.external,[]);assert.deepEqual(report.errors,[]);assert.deepEqual(report.localErrors,[])});
 report.passed=report.checks.every(check=>check.passed);if(!report.passed)process.exitCode=1;
}catch(e){report.passed=false;report.failure={case:active,message:e.message,stack:e.stack};console.error(e);process.exitCode=1}
finally{await browser?.close();report.browserClosed=true;report.finishedAt=new Date().toISOString();report.imageRequests=[...new Set(report.imageRequests)];await mkdir(out,{recursive:true});await writeFile(path.join(out,'curated-v2-results.json'),JSON.stringify(report,null,2)+'\n')}
