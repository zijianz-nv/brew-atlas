// A product's first release/brew year, never its brewery founding or award year.
export function beerLaunchYear(beer) {
  const evidence=beer?.launchYearEvidence;
  return evidence && ['first_release','first_brewed'].includes(evidence.kind)
    && /^https?:\/\//.test(evidence.sourceUrl||'') && typeof evidence.claim==='string' && evidence.claim.trim()
    && Number.isInteger(evidence.year) && evidence.year>0 && evidence.year<=new Date().getFullYear()
    ? evidence.year : null;
}
export function matchesLaunchYear(beer,selectedYear) {
  if(selectedYear==null)return true;
  const year=beerLaunchYear(beer);
  if(selectedYear==='unknown')return year==null;
  return Number.isInteger(selectedYear)&&year===selectedYear;
}
