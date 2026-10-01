export const EMPTY_FACETS = Object.freeze({family:'all', substyle:'all', taste:'all', mouthfeel:'all', aroma:'all', process:'all', ingredient:'all', brewery:'all'});
export const FILTER_DIMENSIONS = [...Object.keys(EMPTY_FACETS), 'country', 'strength'];

export function valuesFor(beer, taxonomy, breweryMap, dimension) {
  const record = taxonomy[beer.id] || {};
  if (dimension === 'family') return [record.family || 'unknown'];
  if (dimension === 'substyle') return [record.substyle?.id || 'unknown'];
  if (dimension === 'brewery') return [beer.breweryId || 'unknown'];
  if (dimension === 'country') return [breweryMap[beer.breweryId]?.country || 'unknown'];
  if (dimension === 'strength') return [Number.isFinite(beer.abv) ? (beer.abv <= 4.5 ? 'light' : beer.abv <= 7 ? 'balanced' : 'strong') : 'unknown'];
  return record[dimension]?.length ? record[dimension] : ['unknown'];
}

export function matchesFilters(beer, taxonomy, breweryMap, selections, omit) {
  return FILTER_DIMENSIONS.every(dimension => {
    if (dimension === omit || (omit === 'family' && dimension === 'substyle') || (omit === 'country' && dimension === 'brewery')) return true;
    const chosen = selections[dimension];
    return !chosen || chosen === 'all' || valuesFor(beer, taxonomy, breweryMap, dimension).includes(chosen);
  });
}

export function filterCatalog(beers, taxonomy, breweryMap, selections) {
  return beers.filter(beer => matchesFilters(beer, taxonomy, breweryMap, selections));
}

// Each dimension counts matches under all the other current selections. Family
// changes also release the old child style, so users can switch to a new family.
export function countFacets(beers, taxonomy, breweryMap, selections) {
  const bitFor = dimension => 1 << FILTER_DIMENSIONS.indexOf(dimension);
  const dimensions = FILTER_DIMENSIONS.map((dimension, index) => ({
    dimension, index, bit: 1 << index, counts: {all:0},
    ignored: bitFor(dimension)
      | (dimension === 'family' ? bitFor('substyle') : 0)
      | (dimension === 'country' ? bitFor('brewery') : 0),
  }));
  const active = dimensions.filter(({dimension}) => selections[dimension] && selections[dimension] !== 'all');
  for (const beer of beers) {
    const values = [];
    let failed = 0;
    // Reuse each selected dimension's values for every contextual count.
    for (const {dimension, index, bit} of active) {
      values[index] = valuesFor(beer, taxonomy, breweryMap, dimension);
      if (!values[index].includes(selections[dimension])) failed |= bit;
    }
    for (const {dimension, index, ignored, counts} of dimensions) {
      if (failed & ~ignored) continue;
      counts.all++;
      const entries = values[index] || valuesFor(beer, taxonomy, breweryMap, dimension);
      // Most records have one value (including unknown); avoid a Set there.
      for (const value of entries.length === 1 ? entries : new Set(entries)) counts[value] = (counts[value] || 0) + 1;
    }
  }
  return Object.fromEntries(dimensions.map(({dimension, counts}) => [dimension, counts]));
}
