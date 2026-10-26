import test from "node:test";
import assert from "node:assert/strict";
import {buildQBControversyAnalysis} from "../src/analysis/qb-controversy.mjs";
import handler from "../netlify/functions/qb-optimizer.mjs";

const games=Array.from({length:5},(_,i)=>({season:2026,week:i+1,played:true,stats:{rec:5,rec_yd:50}}));
const snapshot={
 nfl_week:6,
 league:{id:"1312927511985807360",name:"QB Controversy",season:"2026",scoring_settings:{rec:1,rec_yd:.1,bonus_rec_te:.5},roster_positions:["WR","TE"]},
 my_team:{starters:[{player_id:"w1",name:"Receiver",position:"WR",team:"NYG"},{player_id:"t1",name:"Tight End",position:"TE",team:"NYJ"}],bench:[{player_id:"w2",name:"Missing Logs",position:"WR",team:"NYG"}]}
};
const cache={season:2026,generated_at:new Date().toISOString(),identities:{w1:"00-w1",t1:"00-t1"},players:{w1:games,t1:games}};
test("QB Controversy cache produces league-scored projections, not fabricated missing data",()=>{
 const a=buildQBControversyAnalysis(snapshot,cache);
 assert.equal(a.projected_players,2);
 assert.equal(a.players.find(p=>p.player_id==="w1").projection.projected_points,10);
 assert.equal(a.players.find(p=>p.player_id==="t1").projection.projected_points,12.5);
 assert.equal(a.players.find(p=>p.player_id==="w2").projection.reason,"NO_VERIFIED_GAME_LOGS");
 assert.equal(a.lineup.ok,false);
 assert.equal(a.lineup.reason,"SCHEDULE_OR_IDENTITY_NOT_VERIFIED");
});
test("wrong-season cache fails closed",()=>{
 assert.throws(()=>buildQBControversyAnalysis(snapshot,{...cache,season:2025}),/wrong-season/);
});
test("QB Controversy endpoint retrieves Sleeper and cache and blocks unverified lineup",async()=>{
 const original=globalThis.fetch;
 const requests=[];
 globalThis.fetch=async url=>{
  requests.push(String(url));
  return new Response(JSON.stringify(String(url).includes("historical-weekly")?cache:snapshot),{status:200});
 };
 try{
  const response=await handler(new Request("https://example.netlify.app/.netlify/functions/qb-optimizer"));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.projected_players,2);
  assert.equal(body.lineup.ok,false);
  assert.deepEqual(requests,["https://example.netlify.app/api/league/qb-controversy","https://example.netlify.app/data/historical-weekly.json"]);
 }finally{globalThis.fetch=original}
});
test("endpoint does not produce advice when cache is missing",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes("historical-weekly")?new Response("not found",{status:404}):new Response(JSON.stringify(snapshot));
 try{
  const response=await handler(new Request("https://example.netlify.app/.netlify/functions/qb-optimizer"));
  assert.equal(response.status,503);
 }finally{globalThis.fetch=original}
});

test("missing scored stats do not become zero projections",()=>{
 const a=buildQBControversyAnalysis({...snapshot,league:{...snapshot.league,scoring_settings:{...snapshot.league.scoring_settings,fum_lost:-2}}},cache);
 assert.equal(a.projected_players,0);
 assert.equal(a.players[0].projection.reason,"MISSING_REQUIRED_STATS");
 assert.equal(a.players[0].projection.projected_points,undefined);
});
test("cache identity is required before assigning projections",()=>{
 const a=buildQBControversyAnalysis(snapshot,{...cache,identities:{}});
 assert.equal(a.projected_players,0);
 assert.equal(a.players[0].projection.reason,"NO_VERIFIED_CACHE_IDENTITY");
});
test("stale, future, wrong-league, unsupported scoring and unfinished logs fail closed",()=>{
 for(const generated_at of ["bad","2000-01-01", "2100-01-01"])assert.throws(()=>buildQBControversyAnalysis(snapshot,{...cache,generated_at}));
 assert.throws(()=>buildQBControversyAnalysis({...snapshot,league:{...snapshot.league,id:"other"}},cache),/Wrong league/);
 assert.throws(()=>buildQBControversyAnalysis({...snapshot,league:{...snapshot.league,scoring_settings:{bonus_pass_yd_400:3}}},cache),/Unsupported scoring/);
 assert.throws(()=>buildQBControversyAnalysis(snapshot,{...cache,players:{...cache.players,w1:[{...games[0],week:7}]}}),/unfinished/);
 assert.throws(()=>buildQBControversyAnalysis(snapshot,{...cache,players:{...cache.players,w1:[{...games[0],season:2024}]}}),/season/);
});
test("lineup remains blocked even with independently verified inputs",()=>{
 const schedule={generated_at:new Date().toISOString(),games:[{home:"NYG",away:"NYJ",kickoff:new Date().toISOString()}],players:{w1:{team:"NYG",position:"WR"},t1:{team:"NYJ",position:"TE"},w2:{team:"NYG",position:"WR"}}};
 const a=buildQBControversyAnalysis(snapshot,cache,schedule);
 assert.equal(a.lineup.ok,false);
 assert.equal(a.lineup.reason,"OPTIMIZER_NOT_YET_VERIFIED");
});

test("current-week results are excluded for every player",()=>{
 const a=buildQBControversyAnalysis(snapshot,{...cache,players:{...cache.players,w1:[...games,{...games[0],week:6,stats:{rec:100,rec_yd:900}}]}});
 assert.equal(a.players[0].projection.projected_points,10);
 assert.equal(a.through_week,5);
});

test("position reception premium requires observed receptions even with zero base PPR",()=>{
 const a=buildQBControversyAnalysis({...snapshot,league:{...snapshot.league,scoring_settings:{rec:0,bonus_rec_te:1}}},{...cache,players:{t1:games.map(g=>({...g,stats:{rec_yd:50}}))}});
 assert.equal(a.players.find(p=>p.player_id==="t1").projection.reason,"MISSING_REQUIRED_STATS");
});

test("verified prior-season games fill insufficient current-season sample without authorizing lineup",()=>{
 const previous=games.slice(0,4).map(g=>({...g,season:2025}));
 const current=[{...games[0],season:2026}];
 const a=buildQBControversyAnalysis(snapshot,{...cache,players:{...cache.players,w1:[...previous,...current]}});
 assert.equal(a.players.find(p=>p.player_id==="w1").projection.ok,true);
 assert.equal(a.players.find(p=>p.player_id==="w1").projection.games,5);
 assert.equal(a.lineup.ok,false);
});
