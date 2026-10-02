import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherClient,weatherRequestUrl,loadWeatherForLocations,loadRegionWeather,loadGlobalWeather,
  GLOBAL_WEATHER_POINTS,WEATHER_CACHE_TTL_MS,WEATHER_ATTRIBUTION,weatherDescription} from '../src/weather-data.mjs';
import {weatherDescription as lightweightDescription} from '../src/weather-presentation.mjs';

test('simple weather presentation preserves documented phenomena and never invents a condition for missing or unsupported codes',()=>{
  assert.equal(weatherDescription,lightweightDescription);
  assert.deepEqual(weatherDescription(0),{label:'晴',kind:'sunny'});
  assert.deepEqual(weatherDescription(2),{label:'多云',kind:'cloudy'});
  assert.equal(weatherDescription(3).label,'阴');
  assert.equal(weatherDescription(48).kind,'fog');
  assert.equal(weatherDescription(51).label,'毛毛雨');
  assert.equal(weatherDescription(67).label,'冻雨');
  assert.equal(weatherDescription(75).kind,'snow');
  assert.equal(weatherDescription(82).label,'阵雨');
  assert.equal(weatherDescription(86).label,'阵雪');
  assert.equal(weatherDescription(95).label,'雷雨');
  assert.equal(weatherDescription(97).label,'强雷雨');
  assert.equal(weatherDescription(99).label,'雷雨伴冰雹');
  for(const code of [null,undefined,false,'0',NaN,Infinity,-1,4,50,70,98,100,2.5])
    assert.deepEqual(weatherDescription(code),{label:null,kind:'unknown'});
});

const point={id:'hop-region',lat:46.6,lng:-120.5};
const units={temperature_2m:'°C',cloud_cover:'%',precipitation:'mm',weather_code:'wmo code'};
const current=(lat,lng,extra={})=>({latitude:lat+0.01,longitude:lng+0.01,current_units:units,
  current:{time:1790884800,interval:900,temperature_2m:0,cloud_cover:65,precipitation:0,weather_code:3,...extra}});
const responseFor=url=>{
  const params=new URL(url).searchParams,lats=params.get('latitude').split(',').map(Number),lngs=params.get('longitude').split(',').map(Number);
  return new Response(JSON.stringify(lats.length===1?current(lats[0],lngs[0]):lats.map((lat,i)=>current(lat,lngs[i]))),{headers:{'Content-Type':'application/json'}});
};
const storage=()=>{let value;return {getItem:()=>value,setItem:(key,next)=>{value=next;}};};
const wait=(ms,signal)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(resolve,ms);
  signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
});

test('single crop-region loads only that coordinate, preserves zero and model timestamp, and reuses coordinate cache',async()=>{
  let clock=100000,calls=0;
  const client=createWeatherClient({storage:null,now:()=>clock,debounceMs:0,fetchImpl:async url=>{calls++;return responseFor(url);}});
  assert.equal(calls,0,'construction is lazy');
  const result=await loadRegionWeather({...point,client});
  assert.equal(calls,1);assert.equal(result.points.length,1);assert.equal(result.point.temperatureC,0);
  assert.equal(result.point.precipitationMm,0);assert.equal(result.point.intervalSeconds,900);
  assert.equal(result.point.time,'2026-10-01T20:00:00.000Z');assert.equal(result.point.lat,point.lat);
  assert.equal(result.point.modelLat,point.lat+0.01);assert.equal(result.fromCache,false);
  const repeat=await loadWeatherForLocations([{...point,id:'same-place-another-ingredient'}],{client});
  assert.equal(calls,1);assert.equal(repeat.fromCache,true);assert.equal(repeat.points[0].id,'same-place-another-ingredient');
  assert.equal(Date.parse(repeat.expiresAt)-Date.parse(repeat.fetchedAt),WEATHER_CACHE_TTL_MS);
  clock+=WEATHER_CACHE_TTL_MS;
  assert.equal((await client.load([point])).fromCache,false);assert.equal(calls,2);
});

test('global grid is explicit, bounded, handles ocean coordinates and requests current data only',async()=>{
  let calls=0,active=0,peak=0;const urls=[];
  const client=createWeatherClient({storage:null,debounceMs:0,fetchImpl:async(url,{signal,credentials})=>{
    calls++;urls.push(url);active++;peak=Math.max(peak,active);assert.equal(credentials,'omit');
    try{await wait(3,signal);return responseFor(url);}finally{active--;}
  }});
  assert.equal(GLOBAL_WEATHER_POINTS.length,96);
  const result=await loadGlobalWeather({client});
  assert.equal(result.points.length,96);assert.equal(calls,4);assert.equal(peak,2);
  for(const url of urls){const p=new URL(url).searchParams;assert.equal(p.get('latitude').split(',').length,24);
    assert.equal(p.get('cell_selection'),'nearest');assert.equal(p.get('timezone'),'GMT');
    assert.equal(p.get('current'),'temperature_2m,cloud_cover,precipitation,weather_code');
    assert.equal(p.has('hourly'),false);assert.equal(p.has('apikey'),false);}
  assert.equal(result.sampling.kind,'sparse_global_model_grid');
  assert.equal(result.attribution.license,'CC BY 4.0');assert.match(WEATHER_ATTRIBUTION.description,/不是卫星/);
  const cached=await client.load([GLOBAL_WEATHER_POINTS[4]]);assert.equal(calls,4);assert.equal(cached.fromCache,true);
});

test('persistent cache survives a new client, corrupt/unavailable storage never breaks weather',async()=>{
  const store=storage();let calls=0;
  const options={storage:store,now:()=>10000,debounceMs:0,fetchImpl:async url=>{calls++;return responseFor(url);}};
  await createWeatherClient(options).load([point]);
  assert.equal((await createWeatherClient(options).load([point])).fromCache,true);assert.equal(calls,1);
  store.setItem('', '{broken');await createWeatherClient(options).load([point]);assert.equal(calls,2);
  const disabled={getItem(){throw Error('disabled');},setItem(){throw Error('quota');}};
  const client=createWeatherClient({...options,storage:disabled});await client.load([point]);
  assert.equal((await client.load([point])).fromCache,true);assert.equal(calls,3);
});

test('concurrent repeated location loads share one request; one subscriber abort does not cancel the other',async()=>{
  let calls=0;const controller=new AbortController();
  const client=createWeatherClient({storage:null,debounceMs:5,fetchImpl:async(url,{signal})=>{calls++;await wait(5,signal);return responseFor(url);}});
  const first=client.load([point],{signal:controller.signal}),second=client.load([{...point,id:'other'}]);
  controller.abort();await assert.rejects(first,{name:'AbortError'});
  assert.equal((await second).points[0].id,'other');assert.equal(calls,1);
});

test('turning weather off during debounce makes no network request; timeout aborts active work',async()=>{
  let calls=0;const controller=new AbortController();
  const client=createWeatherClient({storage:null,debounceMs:100,fetchImpl:async url=>{calls++;return responseFor(url);}});
  const pending=client.load([point],{signal:controller.signal});controller.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,0);
  await assert.rejects(client.load([point],{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);
  let aborted=false;
  const slow=createWeatherClient({storage:null,debounceMs:0,timeoutMs:12,fetchImpl:async(url,{signal})=>{
    try{await wait(200,signal);}catch(error){aborted=true;throw error;}return responseFor(url);
  }});
  await assert.rejects(slow.load([point]),{name:'TimeoutError'});assert.equal(aborted,true);
});

test('null values remain missing; invalid units/counts and API failure do not become fabricated current weather',async()=>{
  const nullable=createWeatherClient({storage:null,debounceMs:0,fetchImpl:async()=>new Response(JSON.stringify(current(0,0,{temperature_2m:null,cloud_cover:null,precipitation:null,weather_code:null})))});
  const p=(await nullable.load([point])).points[0];
  for(const key of ['temperatureC','cloudCoverPct','precipitationMm','weatherCode'])assert.equal(p[key],null);
  for(const payload of [{...current(0,0),current_units:{...units,temperature_2m:'°F'}},[],{error:true,reason:'bad'}]){
    const invalid=createWeatherClient({storage:null,debounceMs:0,fetchImpl:async()=>new Response(JSON.stringify(payload))});
    await assert.rejects(invalid.load([point]),{code:'invalid_response'});
  }
  let calls=0;const failed=createWeatherClient({storage:null,debounceMs:0,fetchImpl:async()=>{calls++;return new Response('{}',{status:429});}});
  await assert.rejects(failed.load([point]),{status:429});assert.equal(calls,1,'no automatic retries after rate limiting');
});

test('batch failure aborts the other worker and never publishes a partial snapshot',async()=>{
  let calls=0,aborted=0;
  const client=createWeatherClient({storage:null,debounceMs:0,fetchImpl:async(url,{signal})=>{
    calls++;if(calls===1)return new Response('{}',{status:503});
    try{await wait(200,signal);}catch(error){aborted++;throw error;}return responseFor(url);
  }});
  await assert.rejects(client.load(GLOBAL_WEATHER_POINTS),{status:503});
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,2);assert.equal(aborted,1);
});

test('response limits and coordinate validation prevent unbounded downloads and location mistakes',async()=>{
  assert.throws(()=>weatherRequestUrl([{lat:91,lng:0}]));assert.throws(()=>weatherRequestUrl(GLOBAL_WEATHER_POINTS));
  let calls=0;const client=createWeatherClient({storage:null,debounceMs:0,fetchImpl:async()=>{calls++;return new Response(' '.repeat(140*1024));}});
  await assert.rejects(client.load([]));await assert.rejects(client.load(Array(145).fill(point)));
  await assert.rejects(client.load([{lat:null,lng:0}]));assert.equal(calls,0);
  await assert.rejects(client.load([point]),{code:'response_too_large'});assert.equal(calls,1);
});

test('duplicate coordinate requests preserve caller IDs without duplicating network samples or cache counts',async()=>{
  let requested;
  const client=createWeatherClient({storage:null,debounceMs:0,fetchImpl:async url=>{requested=new URL(url).searchParams.get('latitude');return responseFor(url);}});
  const result=await client.load([point,{...point,id:'barley-at-same-point'}]);
  assert.equal(requested,String(point.lat));assert.equal(result.cachedPoints,0);
  assert.deepEqual(result.points.map(p=>p.id),['hop-region','barley-at-same-point']);
});
