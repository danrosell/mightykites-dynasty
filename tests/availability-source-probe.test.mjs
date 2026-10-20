import test from 'node:test';
import assert from 'node:assert/strict';
import {probeAvailabilitySources} from '../src/analysis/availability-source-probe.mjs';
const metadata={season:2026,week:7,checked_at:'2026-10-20T15:00:00Z'};
const espn={season:{year:2026,type:2},week:{number:7},events:[{id:'401',date:'2026-10-25T17:00:00Z',status:{type:{state:'pre'}},competitions:[{competitors:[]}]}]};
const fetcher=async url=>url.includes('nfl.com')?new Response('<h1>NFL Inactives</h1><p>Check back</p>',{headers:{'content-type':'text/html'}}):Response.json(espn);
test('records only observed NFL and ESPN fields and never grants lineup permission',async()=>{
 const r=await probeAvailabilitySources({...metadata,fetcher});
 assert.equal(r.sources.nfl.reachable,true);assert.equal(r.sources.nfl.html_observations.contains_placeholder,true);
 assert.equal(r.sources.espn.has_game_ids,true);assert.equal(r.sources.espn.has_kickoffs,true);
 assert.ok(r.sources.espn.observed_event_fields.includes('id'));
 assert.equal(r.availability_usable,false);assert.equal(r.optimizer_permission,'BLOCK');
});
test('mismatched season and unreachable NFL fail closed',async()=>{
 const r=await probeAvailabilitySources({...metadata,fetcher:async url=>{
  if(url.includes('nfl.com'))throw Error('Blocked');
  return Response.json({...espn,week:{number:6}});
 }});
 assert.equal(r.sources.nfl.reachable,false);assert.equal(r.sources.espn.season_week_matches,false);
 assert.equal(r.sources.espn.has_game_ids,false);assert.equal(r.optimizer_permission,'BLOCK');
});
test('missing source data and invalid week never authorize availability',async()=>{
 const r=await probeAvailabilitySources({...metadata,fetcher:async()=>new Response('Unavailable',{status:503})});
 assert.equal(r.sources.nfl.reachable,false);assert.equal(r.sources.espn.reachable,false);
 assert.equal(r.availability_usable,false);
 await assert.rejects(()=>probeAvailabilitySources({...metadata,week:19,fetcher}));
});
