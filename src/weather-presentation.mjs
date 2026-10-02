// Simplified labels for the codes explicitly documented by Open-Meteo.
// https://open-meteo.com/en/docs#weathervariables (WMO table, checked 2026-10-02).
// Kept separate so a static UI import does not pull in the lazy API client.
const CONDITIONS = Object.freeze(Object.fromEntries([
  [[0,1],'晴','sunny'],
  [[2],'多云','cloudy'],
  [[3],'阴','cloudy'],
  [[45],'雾','fog'],
  [[48],'雾凇','fog'],
  [[51,53,55],'毛毛雨','rain'],
  [[56,57],'冻毛毛雨','rain'],
  [[61,63,65],'雨','rain'],
  [[66,67],'冻雨','rain'],
  [[71,73,75],'雪','snow'],
  [[77],'米雪','snow'],
  [[80,81,82],'阵雨','rain'],
  [[85,86],'阵雪','snow'],
  [[95],'雷雨','storm'],
  [[97],'强雷雨','storm'],
  [[96,99],'雷雨伴冰雹','storm'],
].flatMap(([codes,label,kind])=>codes.map(code=>[code,Object.freeze({label,kind})]))));
const UNKNOWN = Object.freeze({label:null,kind:'unknown'});

/** Unknown observations stay unknown: no default sun/rain or coercion of null. */
export function weatherDescription(code) {
  return Number.isInteger(code) ? CONDITIONS[code] || UNKNOWN : UNKNOWN;
}
