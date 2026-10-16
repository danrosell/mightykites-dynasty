import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';
const id='1312927511985807360';
const games=[1,2,3,4,5].map(week=>({season:2026,week,played:true,stats:{rec:5,rec_yd:50}}));
const metadata={generated_at:new Date().toISOString(),players:{w1:{player_id:'w1',full_name:'Receiver',position:'WR',team:'NYG'},w2:{player_id:'w2',full_name:'No Logs',position:'WR',team:'NYJ'}}};
const cache={generated_at:new Date().toISOString(),season:2026,identities:{w1:'00-001'},players:{w1:games}};
function envFor(meta=metadata,stats=cache){return {ASSETS:{async fetch(r){const path=new URL(r.url).pathname;if(path==='/data/player-metadata.json')return Response.json(meta);if(path==='/data/historical-weekly.json')return stats?Response.json(stats):new Response('Missing',{status:404});if(path==='/')return new Response('<h1>Dynasty HQ</h1>');return new Response('Not found',{status:404});}}};}
async function withSleeper(fn){
 const original=globalThis.fetch,paths=[];
 globalThis.fetch=async input=>{
  const u=new URL(input);assert.equal(u.origin,'https://api.sleeper.app');paths.push(u.pathname);
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
