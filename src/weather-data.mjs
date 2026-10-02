// Open-Meteo current conditions are model estimates, not satellite/radar imagery.
// Docs: https://open-meteo.com/en/docs (current interval and multi-location API)
// Free endpoint: non-commercial use; https://open-meteo.com/en/terms
export {weatherDescription} from './weather-presentation.mjs';
export const WEATHER_CACHE_TTL_MS = 45 * 60 * 1000;
export const WEATHER_ATTRIBUTION = Object.freeze({
  label:'Weather data by Open-Meteo', url:'https://open-meteo.com/',
  license:'CC BY 4.0', licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  description:'当前数值天气模型估算；所选地点采样，不是卫星实况或长期适生评价。',
});
export const GLOBAL_WEATHER_POINTS = Object.freeze(Array.from({length:96}, (_, index) => Object.freeze({
  id:`weather-grid-${index}`, lat:-75 + Math.floor(index / 16) * 30, lng:-168.75 + index % 16 * 22.5,
})));
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'brew-atlas-weather-locations-v1';
const VARIABLES = ['temperature_2m','cloud_cover','precipitation','weather_code'];
const MAX_LOCATIONS = 144, MAX_BATCH = 24, MAX_CACHE = 192, MAX_RESPONSE_BYTES = 128 * 1024;
const coordinateKey = point => `${point.lat},${point.lng}`;
const validCoordinates = point => Number.isFinite(point?.lat) && Math.abs(point.lat) <= 90
  && Number.isFinite(point?.lng) && Math.abs(point.lng) <= 180;
const abortReason = signal => signal.reason || new DOMException('Aborted','AbortError');
const abortCheck = signal => {if (signal?.aborted) throw abortReason(signal);};
const finiteOrNull = value => Number.isFinite(value) ? value : null;
const inRangeOrNull = (value, min, max) => Number.isFinite(value) && value >= min && value <= max ? value : null;
const iso = milliseconds => new Date(milliseconds).toISOString();

export class WeatherDataError extends Error {
  constructor(message, code, status) {super(message);this.name='WeatherDataError';this.code=code;if(status)this.status=status;}
}

function normalizeLocations(locations) {
  if (!Array.isArray(locations) || !locations.length || locations.length > MAX_LOCATIONS)
    throw new TypeError(`Weather requires 1–${MAX_LOCATIONS} locations`);
  return locations.map(point => {
    if (!validCoordinates(point)) throw new TypeError('Invalid weather location');
    return {id:typeof point.id === 'string' && point.id ? point.id : `weather-${coordinateKey(point)}`,
      lat:point.lat, lng:point.lng};
  });
}

export function weatherRequestUrl(locations) {
  const points = normalizeLocations(locations);
  if (points.length > MAX_BATCH) throw new TypeError(`Weather batch exceeds ${MAX_BATCH} locations`);
  const url = new URL(ENDPOINT);
  url.searchParams.set('latitude',points.map(point=>point.lat).join(','));
  url.searchParams.set('longitude',points.map(point=>point.lng).join(','));
  url.searchParams.set('current',VARIABLES.join(','));
  url.searchParams.set('temperature_unit','celsius');
  url.searchParams.set('precipitation_unit','mm');
  url.searchParams.set('timezone','GMT');
  url.searchParams.set('timeformat','unixtime');
  url.searchParams.set('forecast_days','1');
  // Global samples include ocean. Do not move an ocean point to the nearest land cell.
  url.searchParams.set('cell_selection','nearest');
  return url.href;
}

function parseCurrent(record, point) {
  const current = record?.current, units = record?.current_units;
  if (record?.error || !current || !Number.isFinite(current.time) || !Number.isFinite(current.interval)
    || current.interval <= 0 || units?.temperature_2m !== '°C' || units?.cloud_cover !== '%'
    || units?.precipitation !== 'mm' || units?.weather_code !== 'wmo code')
    throw new WeatherDataError('天气数据格式或单位不符','invalid_response');
  const weatherCode = Number.isInteger(current.weather_code) ? inRangeOrNull(current.weather_code,0,99) : null;
  return {...point, modelLat:finiteOrNull(record.latitude), modelLng:finiteOrNull(record.longitude),
    temperatureC:finiteOrNull(current.temperature_2m), cloudCoverPct:inRangeOrNull(current.cloud_cover,0,100),
    precipitationMm:inRangeOrNull(current.precipitation,0,10000), weatherCode,
    time:iso(current.time * 1000), intervalSeconds:current.interval};
}

function pause(ms, signal) {
  return new Promise((resolve,reject) => {
    abortCheck(signal);
    const onAbort = () => {clearTimeout(timer);reject(abortReason(signal));};
    const timer = setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
    signal.addEventListener('abort',onAbort,{once:true});
  });
}

async function readBoundedJson(response, signal) {
  if (Number(response.headers?.get('content-length')) > MAX_RESPONSE_BYTES)
    throw new WeatherDataError('天气响应超过大小限制','response_too_large');
  // Bound the transfer as well as JSON parsing when the browser supplies a stream.
  if (!response.body?.getReader) {
    const text = await response.text(); abortCheck(signal);
    if (new TextEncoder().encode(text).length > MAX_RESPONSE_BYTES)
      throw new WeatherDataError('天气响应超过大小限制','response_too_large');
    return JSON.parse(text);
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const onAbort = () => {reader.cancel(abortReason(signal)).catch(()=>{});};
  signal.addEventListener('abort',onAbort,{once:true});
  let bytes = 0, text = '';
  try {
    while (true) {
      abortCheck(signal); const {done,value} = await reader.read(); abortCheck(signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel(); throw new WeatherDataError('天气响应超过大小限制','response_too_large');
      }
      text += decoder.decode(value,{stream:true});
    }
    return JSON.parse(text + decoder.decode());
  } finally {signal.removeEventListener('abort',onAbort);reader.releaseLock();}
}

/** Lazy client: creating/importing it does not fetch, start a timer or read geolocation. */
export function createWeatherClient({fetchImpl=globalThis.fetch, storage, now=()=>Date.now(),
  cacheTtlMs=WEATHER_CACHE_TTL_MS, timeoutMs=15000, debounceMs=150, batchSize=MAX_BATCH}={}) {
  if (typeof fetchImpl !== 'function' || typeof now !== 'function' || !Number.isFinite(cacheTtlMs)
    || cacheTtlMs <= 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(debounceMs)
    || debounceMs < 0 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH)
    throw new TypeError('Invalid weather client options');
  const cache = new Map(), jobs = new Map(); let hydrated = false;
  const getStorage = () => {try{return storage === undefined ? globalThis.localStorage : storage;}catch{return null;}};
  const hydrate = () => {
    if (hydrated) return; hydrated = true;
    try {
      const text = getStorage()?.getItem(CACHE_KEY);
      if (!text || text.length > 512 * 1024) return;
      const saved = JSON.parse(text);
      if (saved.version !== 1 || !Array.isArray(saved.entries)) return;
      for (const entry of saved.entries.slice(-MAX_CACHE)) {
        const p = entry?.point;
        if (!validCoordinates(p) || !Number.isFinite(entry.fetchedAt) || !Number.isFinite(entry.expiresAt)
          || entry.fetchedAt > now() || entry.expiresAt <= now() || entry.expiresAt-entry.fetchedAt > cacheTtlMs
          || !Number.isFinite(Date.parse(p.time)) || !Number.isFinite(p.intervalSeconds) || p.intervalSeconds <= 0
          || !['temperatureC','cloudCoverPct','precipitationMm','weatherCode'].every(key=>p[key]===null||Number.isFinite(p[key]))) continue;
        cache.set(coordinateKey(p),entry);
      }
    } catch {/* Browser storage may be disabled or contain an older/corrupt cache. */}
  };
  const persist = () => {
    const entries = [...cache.values()].filter(entry=>entry.expiresAt>now()).sort((a,b)=>a.fetchedAt-b.fetchedAt).slice(-MAX_CACHE);
    cache.clear(); for(const entry of entries)cache.set(coordinateKey(entry.point),entry);
    try {getStorage()?.setItem(CACHE_KEY,JSON.stringify({version:1,entries}));} catch {/* Memory cache still works. */}
  };
  const fetchPoints = async (points, signal) => {
    await pause(debounceMs,signal);
    const batches = [];
    for(let i=0;i<points.length;i+=batchSize)batches.push(points.slice(i,i+batchSize));
    let next = 0;
    const results = new Map();
    const worker = async () => {
      while(next<batches.length) {
        abortCheck(signal); const batch=batches[next++];
        const response=await fetchImpl(weatherRequestUrl(batch),{signal,credentials:'omit',referrerPolicy:'no-referrer'});
        abortCheck(signal);
        if(!response.ok)throw new WeatherDataError(`天气服务暂不可用 (${response.status})`,'http_error',response.status);
        const raw=await readBoundedJson(response,signal), records=Array.isArray(raw)?raw:[raw];
        if(records.length!==batch.length)throw new WeatherDataError('天气采样点数不符','invalid_response');
        const fetchedAt=now();
        for(let i=0;i<batch.length;i++) {
          const point=parseCurrent(records[i],batch[i]);
          results.set(coordinateKey(point),{point,fetchedAt,expiresAt:fetchedAt+cacheTtlMs});
        }
      }
    };
    // Complete snapshots only; failures never replace a valid old cache with half a batch.
    await Promise.all(Array.from({length:Math.min(2,batches.length)},worker));
    abortCheck(signal);
    for(const [key,entry] of results)cache.set(key,entry);
    persist(); return results;
  };
  const getJob = missing => {
    const key=missing.map(coordinateKey).sort().join('|');
    const existing=jobs.get(key);
    if(existing&&!existing.controller.signal.aborted)return existing;
    const controller=new AbortController(),job={controller,subscribers:new Set()};
    const timer=setTimeout(()=>controller.abort(new DOMException('天气请求超时','TimeoutError')),timeoutMs);
    job.promise=fetchPoints(missing,controller.signal).catch(error=>{controller.abort(error);throw error;})
      .finally(()=>{clearTimeout(timer);if(jobs.get(key)===job)jobs.delete(key);});
    jobs.set(key,job); return job;
  };
  const subscribe = (job,signal) => new Promise((resolve,reject) => {
    const subscriber={};job.subscribers.add(subscriber);
    const release = () => {signal?.removeEventListener('abort',onAbort);job.subscribers.delete(subscriber);};
    const onAbort = () => {release();if(!job.subscribers.size)job.controller.abort(abortReason(signal));reject(abortReason(signal));};
    job.promise.then(value=>{release();resolve(value);},error=>{release();reject(error);});
    if(signal?.aborted){onAbort();return;}
    signal?.addEventListener('abort',onAbort,{once:true});
  });
  return Object.freeze({
    async load(locations,{signal,forceRefresh=false}={}) {
      abortCheck(signal); const points=normalizeLocations(locations);hydrate();
      const unique=[...new Map(points.map(point=>[coordinateKey(point),point])).values()];
      const missing=unique.filter(point=>forceRefresh||!cache.has(coordinateKey(point))||cache.get(coordinateKey(point)).expiresAt<=now());
      const missingKeys=new Set(missing.map(coordinateKey));
      const available=new Map(unique.filter(point=>!missingKeys.has(coordinateKey(point))).map(point=>[coordinateKey(point),cache.get(coordinateKey(point))]));
      let fetched=new Map();
      if(missing.length)fetched=await subscribe(getJob(missing),signal);
      abortCheck(signal);
      const entries=points.map(point=>{const entry=fetched.get(coordinateKey(point))||available.get(coordinateKey(point));
        return {...entry,point:{...entry.point,...point,fetchedAt:iso(entry.fetchedAt),expiresAt:iso(entry.expiresAt)}};});
      return {schemaVersion:1,provider:'Open-Meteo',attribution:WEATHER_ATTRIBUTION,
        sampling:{kind:'requested_model_locations',pointCount:points.length,description:WEATHER_ATTRIBUTION.description},
        fetchedAt:iso(Math.min(...entries.map(entry=>entry.fetchedAt))),expiresAt:iso(Math.min(...entries.map(entry=>entry.expiresAt))),
        fromCache:missing.length===0,cachedPoints:points.filter(point=>!missingKeys.has(coordinateKey(point))).length,points:entries.map(entry=>entry.point)};
    },
  });
}

let defaultClient;
/** Arbitrary crop-region points share coordinate caches; no global request is implicit. */
export function loadWeatherForLocations(locations,options={}) {
  defaultClient ||= createWeatherClient();
  return (options.client||defaultClient).load(locations,options);
}
export async function loadRegionWeather({lat,lng,id,signal,forceRefresh=false,client}={}) {
  const snapshot=await loadWeatherForLocations([{id,lat,lng}],{signal,forceRefresh,client});
  return {...snapshot,point:snapshot.points[0]};
}
/** Optional 96-point world view; the UI must explicitly ask for it. */
export async function loadGlobalWeather(options={}) {
  const snapshot=await loadWeatherForLocations(GLOBAL_WEATHER_POINTS,options);
  return {...snapshot,sampling:{...snapshot.sampling,kind:'sparse_global_model_grid',latitudeStep:30,longitudeStep:22.5}};
}
