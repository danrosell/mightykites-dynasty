import test from 'node:test';
import assert from 'node:assert/strict';
import {NFL_TEAMS} from '../src/analysis/independent.mjs';
import worker from '../cloudflare/worker.mjs';
const id='1312927511985807360';
const games=[1,2,3,4,5].map(week=>({season:2026,week,played:true,stats:{rec:5,rec_yd:50}}));
const metadata={generated_at:new Date().toISOString(),players:{w1:{player_id:'w1',full_name:'Receiver',position:'WR',team:'NYG'},w2:{player_id:'w2',full_name:'No Logs',position:'WR',team:'NYJ'}}};
const cache={generated_at:new Date().toISOString(),season:2026,identities:{w1:'00-001'},players:{w1:games}};
function envFor(meta=metadata,stats=cache,independent=null){return {ASSETS:{async fetch(r){const path=new URL(r.url).pathname;if(path==='/data/independent-verification.json'&&independent)return Response.json(independent);if(path==='/data/player-metadata.json')return Response.json(meta);if(path==='/data/historical-weekly.json')return stats?Response.json(stats):new Response('Missing',{status:404});if(path==='/')return new Response('<h1>Dynasty HQ</h1>');return new Response('Not found',{status:404});}}};}
async function withSleeper(fn){
 const original=globalThis.fetch,paths=[];
 globalThis.fetch=async input=>{
  const u=new URL(input);if(u.origin==='https://site.api.espn.com')return Response.json(espn);assert.equal(u.origin,'https://api.sleeper.app');paths.push(u.pathname);
  if(u.pathname.endsWith('/players/nfl'))throw Error('Full player database must not be fetched at runtime');
  const body=u.pathname==='/v1/state/nfl'?{week:6,season:'2026'}:u.pathname.endsWith('/users')?[{user_id:'user',display_name:'TheMightyKites'}]:u.pathname.endsWith('/rosters')?[{owner_id:'user',roster_id:1,players:['w1','w2'],starters:['w1'],settings:{}}]:u.pathname.endsWith('/traded_picks')||u.pathname.includes('/matchups/')?[]:{league_id:id,name:'QB Controversy',season:'2026',scoring_settings:{rec:1,rec_yd:.1},roster_positions:['WR','BN'],settings:{}};
  return Response.json(body);
 };
 try{await fn(paths);}finally{globalThis.fetch=original;}
}
test('Cloudflare routes optimizer internally and blocks missing data and lineup advice',()=>withSleeper(async paths=>{
 const r=await worker.fetch(new Request('https://site.workers.dev/api/optimizer/qb-controversy'),envFor());
 assert.equal(r.status,200);const body=await r.json();
 assert.equal(body.players[0].projection.projected_points,10);
 assert.equal(body.players[1].projection.reason,'NO_VERIFIED_GAME_LOGS');
 assert.equal(body.lineup.ok,false);
 assert.ok(!paths.includes('/v1/players/nfl'));
}));
test('all four league feeds route to live Sleeper and support legacy URLs',()=>withSleeper(async()=>{
 for(const slug of ['imperial','qb-controversy','jersey','tri-state'])for(const prefix of ['/api/league/','/.netlify/functions/league/']){
  const r=await worker.fetch(new Request('https://site.workers.dev'+prefix+slug),envFor());assert.equal(r.status,200);assert.equal((await r.json()).my_team.starters[0].name,'Receiver');
 }
}));
test('stale/missing player metadata and missing statistics fail closed',()=>withSleeper(async()=>{
 for(const env of [envFor({...metadata,generated_at:'2000-01-01'}),envFor({...metadata,players:{}}),envFor(metadata,null)]){
  const r=await worker.fetch(new Request('https://site.workers.dev/api/optimizer/qb-controversy'),env);
  assert.equal(r.status,503);assert.equal((await r.json()).players,undefined);
 }
}));
test('assets, unknown routes and unsupported methods are handled explicitly',async()=>{
 const env=envFor();
 assert.equal((await worker.fetch(new Request('https://site.workers.dev/'),env)).status,200);
 assert.equal((await worker.fetch(new Request('https://site.workers.dev/api/league/unknown'),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://site.workers.dev/api/unknown'),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://site.workers.dev/api/optimizer/qb-controversy',{method:'POST'}),env)).status,405);
});

const pairs=Array.from({length:14},(_,i)=>({home:[...NFL_TEAMS][i*2],away:[...NFL_TEAMS][i*2+1]}));
const espn={season:{year:2026,type:2},week:{number:6},events:pairs.map((p,i)=>({id:String(i),status:{type:{state:'pre'}},date:'2026-10-18T17:00:00Z',competitions:[{competitors:[{homeAway:'home',team:{abbreviation:p.home}},{homeAway:'away',team:{abbreviation:p.away}}]}]}))};
const independent={generated_at:new Date().toISOString(),season:2026,week:6,source:{players:'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv',schedule:'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv'},players:{w1:{team:'NYG',position:'WR',status:'ACT',gsis_id:'00-001',verified:true},w2:{team:'NYJ',position:'WR',status:'ACT',gsis_id:'00-002',verified:true}},games:pairs.map((p,i)=>({...p,game_id:'g'+i,local_date:'2026-10-18',local_time:'13:00'}))};
test('HTTP optimizer integrates independent identities and schedule but never assumes availability',()=>withSleeper(async()=>{
 const r=await worker.fetch(new Request('https://site.workers.dev/api/optimizer/qb-controversy'),envFor(metadata,cache,independent)),body=await r.json();
 assert.equal(r.status,200);assert.equal(body.verification.ok,true);assert.equal(body.players[0].projection.projected_points,10);
 assert.equal(body.lineup.ok,false);assert.equal(body.lineup.reason,'AVAILABILITY_OR_PROJECTIONS_NOT_VERIFIED');assert.equal(body.lineup.slots,undefined);
}));
test('identity mismatch preserves historical baselines and blocks lineup advice',()=>withSleeper(async()=>{
 const changed=structuredClone(independent);changed.players.w1.team='MIA';
 const r=await worker.fetch(new Request('https://site.workers.dev/api/optimizer/qb-controversy'),envFor(metadata,cache,changed)),body=await r.json();
 assert.equal(r.status,200);assert.equal(body.verification.ok,false);assert.equal(body.lineup.ok,false);assert.equal(body.projected_players,1);
}));
