import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseRiderPosition, freshRiderPosition, newerRiderPosition, recordRiderProgress} from '../lib/rider-tracking.ts';
import {createRoadRouter} from '../lib/road-routing.ts';
const point = {latitude:19.06,longitude:72.83,accuracy:25,updatedAt:100000};
test('distance covered sums GPS movement, ignores unreliable fixes and breaks the trail after gaps', () => {
 const start = recordRiderProgress(undefined, point, 100_000);
 assert.equal(start.coveredMeters, 0);
 const jitter = recordRiderProgress(start, {...point, latitude:19.06006}, 110_000);
 assert.equal(jitter.coveredMeters, 0);
 assert.equal(jitter.trail.length, 1);
 const moving = recordRiderProgress(jitter, {...point, latitude:19.061}, 120_000);
 assert.equal(moving.coveredMeters, 111);
 assert.equal(moving.trail.length, 2);
 assert.equal(recordRiderProgress(moving, {...point, longitude:77}, 130_000), moving);
 assert.equal(recordRiderProgress(moving, {...point, accuracy:120}, 130_000), moving);
 assert.equal(recordRiderProgress(moving, point, 115_000), moving);
 const resumed = recordRiderProgress(moving, {...point, latitude:19.10}, 190_000);
 assert.equal(resumed.coveredMeters, 111);
 assert.equal(resumed.trail.at(-1).startsSegment, true);
 const onReturn = recordRiderProgress(resumed, {...point, latitude:19.099}, 200_000);
 assert.equal(onReturn.coveredMeters, 222);
});
test('GPS validation accepts coarse real fixes but rejects malformed, impossible and non-finite fixes',()=>{
 assert.deepEqual(parseRiderPosition(point),point);
 assert.equal(parseRiderPosition({...point,updatedAt:{toMillis:()=>100000}}).updatedAt,100000);
 assert.equal(parseRiderPosition({...point,accuracy:800}).accuracy,800);
 for(const change of [{latitude:NaN},{longitude:181},{latitude:-91},{accuracy:1001},{accuracy:-1},{latitude:'19.06'}]) assert.equal(parseRiderPosition({...point,...change}),null);
});
test('freshness uses received time, never treats stale or future fixes as live, and ignores out-of-order responses',()=>{
 assert.equal(freshRiderPosition(point,110000),true);
 assert.equal(freshRiderPosition(point,146000),false);
 assert.equal(freshRiderPosition({...point,updatedAt:120000},110000),false);
 assert.equal(freshRiderPosition({...point,updatedAt:undefined},110000),false);
 assert.equal(newerRiderPosition(point,{...point,updatedAt:90000}),point);
 assert.equal(newerRiderPosition(point,null),point);
 assert.equal(newerRiderPosition(null,point),point);
});
test('geometry requests parse actual GeoJSON roads, preserve longitude-first coordinates and keep pricing caches separate',async()=>{
 const calls=[]; const geometry=[[72.83,19.06],[72.831,19.061],[72.835,19.067]];
 const route=createRoadRouter('fixture',async(url,init)=>{
  calls.push({url,body:JSON.parse(init.body)});
  return Response.json(url.endsWith('/geojson')?{features:[{properties:{summary:{distance:1400,duration:180}},geometry:{type:'LineString',coordinates:geometry}}]}:{routes:[{summary:{distance:1400,duration:180}}]});
 });
 const result=await route(point,{latitude:19.067,longitude:72.835},false,true);
 assert.deepEqual(result.geometry,geometry);assert.equal(result.distanceMeters,1400);
 assert.deepEqual(calls[0].body.coordinates,[[72.83,19.06],[72.835,19.067]]);
 assert.equal(calls[0].body.geometry,true);
 await route(point,{latitude:19.067,longitude:72.835});assert.equal(calls.length,2);assert.equal(calls[1].body.geometry,false);
 for(const line of [{type:'Point',coordinates:geometry},{type:'LineString',coordinates:[[181,19],[72,19]]},{type:'LineString',coordinates:[[72,19]]}]){
  await assert.rejects(createRoadRouter('fixture',async()=>Response.json({features:[{properties:{summary:{distance:1,duration:1}},geometry:line}]}))(point,point,false,true),/could not be drawn/);
 }
});
