import test from 'node:test';import assert from 'node:assert/strict';
import {recommendRegionBeers,allocateRegionBeerRecommendations} from '../src/ingredient-recommendations.mjs';
const region={type:'coffee',country:'Ethiopia',lat:6.7,lng:38.4};
const breweries={local:{id:'local',country:'Ethiopia',lat:7,lng:38.4,locationVerified:true},far:{id:'far',country:'New Zealand',lat:-36.8,lng:174.8,locationVerified:true}};
const beer=(id,breweryId,extra={})=>({id,name:id,breweryId,image:`/images/${id}.webp`,description:'A verified introduction to this product.',...extra});
const coffee={evidence:[{dimension:'ingredient',id:'coffee',text:'Brewed with coffee',sourceUrl:'https://example.org/product'}]};
test('real nearby beer takes priority, missing photos and labels never count as recommendations',()=>{
 const result=recommendRegionBeers(region,[beer('photo','local'),beer('missing','local',{image:null}),beer('logo','local',{imageKind:'brewery_logo'}),beer('recipe','far')],breweries,{taxonomyIndex:{recipe:coffee}});
 assert.deepEqual(result.map(x=>x.beer.id),['photo','recipe']);assert.equal(result[0].scope,'nearby');assert.equal(result[1].scope,'ingredient');
});
test('nonlocal coffee aroma does not prove added coffee or regional sourcing',()=>{
 const aroma={evidence:[{dimension:'aroma',id:'coffee',text:'Coffee aroma',sourceUrl:'https://example.org/product'}]};
 assert.deepEqual(recommendRegionBeers(region,[beer('aroma','far')],breweries,{taxonomyIndex:{aroma}}),[]);
 const result=recommendRegionBeers(region,[beer('coffee','far')],breweries,{taxonomyIndex:{coffee}});
 assert.equal(result.length,1);assert.equal(result[0].scope,'ingredient');assert.ok(result[0].distanceKm>10000);
});
test('at most three distinct bottles; broad spice evidence does not prove coriander',()=>{
 const result=recommendRegionBeers(region,[beer('a','local'),beer('copy','local',{image:'/images/a.webp'}),beer('b','local'),beer('c','local'),beer('d','local')],breweries);
 assert.equal(result.length,3);assert.equal(new Set(result.map(x=>x.beer.image)).size,3);
 const spice={evidence:[{dimension:'ingredient',id:'spice',text:'Brewed with ginger',sourceUrl:'https://example.org/product'}]};
 assert.equal(recommendRegionBeers({...region,type:'coriander'},[beer('spice','far')],breweries,{taxonomyIndex:{spice}}).length,0);
});

test('allocation shares bottles in rounds and never repeats an image across regions',()=>{
 const regions=[{...region,id:'a'},{...region,id:'b'}];
 const beers=[beer('one','local'),beer('copy','local',{image:'/images/one.webp'}),beer('two','local'),beer('three','local')];
 const allocated=allocateRegionBeerRecommendations(regions,beers,breweries);
 assert.deepEqual([...allocated.values()].map(x=>x.length),[2,1]);
 const selected=[...allocated.values()].flat();
 assert.equal(new Set(selected.map(x=>x.beer.id)).size,3);
 assert.equal(new Set(selected.map(x=>x.beer.image)).size,3);
});
test('allocation prioritizes supported awards but does not take unrelated foreign beer',()=>{
 const awarded=beer('winner','local',{awards:[{medal:'gold',ratingYear:2025,region:'Ethiopia',style:'Lager'}]});
 const foreignWinner=beer('foreign','far',{awards:awarded.awards});
 const allocated=allocateRegionBeerRecommendations([{...region,id:'a'}],[beer('aaa','local'),foreignWinner,awarded],breweries,{limit:1});
 assert.deepEqual(allocated.get('a').map(x=>x.beer.id),['winner']);
 assert.deepEqual(allocateRegionBeerRecommendations([{...region,id:'a'}],[foreignWinner],breweries).get('a'),[]);
});
test('allocation permits documented nonlocal ingredient examples and caps each region at three',()=>{
 const beers=Array.from({length:8},(_,i)=>beer('coffee'+i,'far'));
 const taxonomyIndex=Object.fromEntries(beers.map(b=>[b.id,coffee]));
 const allocated=allocateRegionBeerRecommendations([{...region,id:'a'}],beers,breweries,{taxonomyIndex,limit:99});
 assert.equal(allocated.get('a').length,3);assert.ok(allocated.get('a').every(x=>x.scope==='ingredient'));
 assert.equal(allocateRegionBeerRecommendations([{...region,id:'a'}],beers,breweries,{taxonomyIndex,limit:0}).get('a').length,0);
});

test('cited sales claims outrank representatives, but ratings and unsupported bestseller flags do not',async()=>{
 const {compareBeerPhotoRank}=await import('../src/beer-ranking.mjs');
 const sales=beer('z-sales','local',{salesEvidence:{kind:'best_seller',claim:'Our best-selling beer',sourceUrl:'https://brewery.example/product'}});
 const representative=beer('a-representative','local',{collections:['representative']});
 const unsupported=beer('0-unsupported','local',{bestSeller:true,rating:5,ratingsCount:9999,collection:'beertasting'});
 const award=beer('zz-award','local',{awards:[{medal:'gold',ratingYear:2025,region:'Ethiopia',style:'Lager'}]});
 assert.deepEqual([unsupported,representative,sales,award].sort(compareBeerPhotoRank).map(b=>b.id),['zz-award','z-sales','a-representative','0-unsupported']);
});

test('global recommendations resolve transitive photo aliases before allocating',async()=>{
 const {allocateRegionBeerRecommendations}=await import('../src/ingredient-recommendations.mjs');
 const rows=[beer('a','local',{image:'/images/a.webp'}),beer('bridge','local',{image:'/images/b.webp',imageOriginal:'/images/a.webp'}),beer('c','local',{image:'/images/c.webp',imageOriginal:'/images/b.webp'})];
 const plan=allocateRegionBeerRecommendations([{...region,id:'one'},{...region,id:'two'}],rows,breweries);
 assert.equal([...plan.values()].flat().length,1);
});


test('local beers precede awarded foreign ingredient examples, while local awards still rank first',()=>{
 const awards=[{medal:'gold',ratingYear:2025,region:'New Zealand',style:'Coffee Stout'}];
 const rows=[beer('foreign-award','far',{awards}),beer('local-plain','local'),beer('local-winner','local',{awards})];
 const plan=allocateRegionBeerRecommendations([{...region,id:'one'}],rows,breweries,{taxonomyIndex:{'foreign-award':coffee}});
 assert.deepEqual(plan.get('one').map(x=>x.beer.id),['local-winner','local-plain','foreign-award']);
 assert.deepEqual(plan.get('one').map(x=>x.scope),['nearby','nearby','ingredient']);
});

test('two sparse-country regions each receive a local bottle before foreign ingredient fallback can claim it',()=>{
 const regions=[{...region,id:'a-foreign',country:'Japan',lat:39,lng:141},{...region,id:'b-coffee'},{...region,id:'c-barley',type:'barley'}];
 const rows=[beer('local-one','local'),beer('local-two','local'),beer('foreign-coffee','far')];
 const plan=allocateRegionBeerRecommendations(regions,rows,breweries,{taxonomyIndex:{'local-one':coffee,'foreign-coffee':coffee}});
 assert.ok(plan.get('b-coffee').some(x=>x.scope==='nearby'));
 assert.ok(plan.get('c-barley').some(x=>x.scope==='nearby'));
 assert.deepEqual(plan.get('a-foreign').map(x=>x.beer.id),['foreign-coffee']);
 assert.equal(new Set([...plan.values()].flat().map(x=>x.beer.id)).size,3);
});
