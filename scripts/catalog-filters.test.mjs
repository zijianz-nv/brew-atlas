import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCatalog,countFacets,EMPTY_FACETS,FILTER_DIMENSIONS,matchesFilters,valuesFor,beerSearchText} from '../src/catalog-filters.mjs';

const beers=[{id:'a',breweryId:'one',abv:0},{id:'b',breweryId:'two',abv:null},{id:'c',breweryId:'two',abv:6}];
const breweries={one:{country:'A'},two:{country:'B'}};
const taxonomy={a:{family:'ipa',substyle:{id:'hazy'},taste:['sweet'],aroma:['citrus','tropical']},b:{family:'lager-bock',substyle:{id:'pils'},taste:[],aroma:[]},c:{family:'ipa',substyle:{id:'american'},taste:['bitter'],aroma:['citrus']}};
const base={...EMPTY_FACETS,country:'all',strength:'all'};
test('city, region and supplied native aliases locate the same beer without changing its origin',()=>{
  const beer={name:'Local IPA',nameAliases:['Местный IPA'],style:'IPA',flavors:['柑橘']};
  const brewery={name:'Local Brewery',city:'Almaty',cityZh:'阿拉木图',cityAliases:['Алматы','Alma-Ata'],
    region:'Almaty Region',regionZh:'阿拉木图州',country:'Kazakhstan',countryZh:'哈萨克斯坦'};
  const before=structuredClone({beer,brewery}),text=beerSearchText(beer,brewery);
  for(const term of ['Almaty','阿拉木图','Алматы','Alma-Ata','哈萨克斯坦','Местный IPA','柑橘'])assert.ok(text.includes(term.toLowerCase()),term);
  assert.ok(!text.includes('bishkek'));
  assert.deepEqual({beer,brewery},before);
  assert.equal(beerSearchText({name:'Only a name'},undefined),'only a name');
});
test('unknown is distinct from zero ABV and absent facets remain searchable',()=>{
  assert.deepEqual(filterCatalog(beers,taxonomy,breweries,{...base,strength:'light'}).map(b=>b.id),['a']);
  assert.deepEqual(filterCatalog(beers,taxonomy,breweries,{...base,strength:'unknown',aroma:'unknown'}).map(b=>b.id),['b']);
  assert.deepEqual(filterCatalog(beers,taxonomy,breweries,{...base,taste:'bitter',aroma:'tropical'}),[]);
});
test('context counts release dependent substyle and brewery when parent changes',()=>{
  const counts=countFacets(beers,taxonomy,breweries,{...base,family:'ipa',substyle:'hazy'});
  assert.equal(counts.family['lager-bock'],1);
  assert.equal(counts.substyle.american,1);
  const countries=countFacets(beers,taxonomy,breweries,{...base,country:'A',brewery:'one'});
  assert.equal(countries.country.B,2);
  assert.equal(countries.brewery.two,undefined);
});
test('facet counts preserve cross-dimension constraints without double counting a record',()=>{
  const counts=countFacets(beers,taxonomy,breweries,{...base,family:'ipa',taste:'bitter',aroma:'citrus'});
  assert.equal(counts.aroma.all,1);
  assert.equal(counts.aroma.citrus,1);
  assert.equal(counts.aroma.tropical,undefined);
  assert.equal(counts.taste.sweet,1);
  assert.equal(counts.taste.bitter,1);
  assert.deepEqual(filterCatalog(beers,taxonomy,breweries,{...base,taste:'bitter',aroma:'citrus'}).map(b=>b.id),['c']);
});
test('single-pass counts match independent per-dimension counting across every active-filter combination',()=>{
  const inputs=[...beers,{id:'d',breweryId:null,abv:4.5},{id:'e',breweryId:'missing',abv:7}];
  const records={...taxonomy,d:{family:'ipa',taste:['sweet','sweet'],aroma:['citrus','citrus','tropical'],process:['dry-hop']}};
  const chosen={family:'ipa',substyle:'pils',taste:'bitter',mouthfeel:'unknown',aroma:'tropical',process:'dry-hop',ingredient:'unknown',brewery:'one',country:'B',strength:'light'};
  const snapshot=structuredClone({inputs,records,breweries});
  for(let mask=0;mask<2**FILTER_DIMENSIONS.length;mask++){
    const selections=Object.fromEntries(FILTER_DIMENSIONS.map((dimension,index)=>[dimension,mask&(1<<index)?chosen[dimension]:'all']));
    const expected=Object.fromEntries(FILTER_DIMENSIONS.map(dimension=>{
      const counts={all:0};
      for(const beer of inputs){
        if(!matchesFilters(beer,records,breweries,selections,dimension))continue;
        counts.all++;
        for(const value of new Set(valuesFor(beer,records,breweries,dimension)))counts[value]=(counts[value]||0)+1;
      }
      return [dimension,counts];
    }));
    assert.deepEqual(countFacets(inputs,records,breweries,selections),expected,`active-filter mask ${mask}`);
  }
  assert.deepEqual({inputs,records,breweries},snapshot);
});
