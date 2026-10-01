// Add reviewed facts to existing selections without changing membership,
// award scores, brewery joins, locations or images.
const normal = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const allowed = new Set(['abv','ibu','description','originalDescription']);
const webUrl = value => {try {return ['http:','https:'].includes(new URL(value).protocol);} catch {return false;}};

export function applyFactSupplements(beers, breweries, input = {records:[]}) {
  const report = {reviewedRecords:0,enrichedRecords:0,filledFields:0,conflicts:[]};
  for (const row of input.records || []) {
    const id = String(row.untappdId || '');
    const beer = beers.get(`curated-award-${id}`);
    const brewery = beer && breweries.get(beer.breweryId);
    if (!beer || normal(row.expectedName)!==normal(beer.name)
      || normal(row.expectedBrewery)!==normal(brewery?.name)
      || row.identityEvidence?.status!=='reviewed_same_product')
      throw new Error(`Unverified supplemental identity: ${id}`);
    const urls = [...new Set(row.sourceUrls || [])];
    if (!urls.length || !urls.every(webUrl) || !row.sources?.length
      || !row.sources.every(s=>webUrl(s.url) && urls.includes(s.url))
      || !urls.some(url=>{const u=new URL(url);return ['untappd.com','awards.untappd.com'].includes(u.hostname)
        && new RegExp(`/(?:b/[^/]+|beers)/${id}/?$`).test(u.pathname);}))
      throw new Error(`Missing supplemental source evidence: ${id}`);
    const fields = row.fields || {};
    for (const [key,value] of Object.entries(fields)) {
      if (!allowed.has(key)) throw new Error(`Forbidden supplemental field: ${key}`);
      if (value==null) continue;
      if (key==='abv' || key==='ibu') {
        if (!Number.isFinite(value) || value<0 || (key==='abv' && value>100))
          throw new Error(`Invalid supplemental ${key}: ${id}`);
      } else if (typeof value!=='string' || !value.trim()) throw new Error(`Invalid supplemental ${key}: ${id}`);
    }
    const filledFields = [], unchangedFields = [], conflicts = [];
    for (const [key,value] of Object.entries(fields)) {
      if (value==null) continue;
      if (beer[key]==null || beer[key]==='') {beer[key]=value;filledFields.push(key);}
      else if (beer[key]===value) unchangedFields.push(key);
      else conflicts.push({field:key,retained:beer[key],candidate:value});
    }
    beer.sourceUrls=[...new Set([...beer.sourceUrls,...urls])];
    beer.sourceEvidence=[...beer.sourceEvidence,...row.sources];
    beer.factSupplements=[...(beer.factSupplements || []),{
      sourceUrls:urls,identityEvidence:row.identityEvidence,filledFields,unchangedFields,conflicts,
      note:row.note || null,
    }];
    if (filledFields.length) {
      // The initial award-only note becomes stale once product facts arrive.
      const initial='Untappd 公开获奖列表；按评分年份记录。独立精酿属性、酒款介绍、图片及酒厂坐标尚待核验。';
      if (beer.sourceNote===initial) beer.sourceNote='Untappd 公开获奖记录；产品资料另附来源，独立精酿属性、实物图片及酒厂坐标仍待核验。';
      beer.sourceNote=[beer.sourceNote,row.note].filter(Boolean).join(' ');
      report.enrichedRecords++;
      report.filledFields+=filledFields.length;
    }
    report.reviewedRecords++;
    if (conflicts.length) report.conflicts.push({untappdId:id,conflicts});
  }
  return report;
}
