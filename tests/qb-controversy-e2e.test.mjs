import test from "node:test";
import assert from "node:assert/strict";
import {buildQBControversyAnalysis} from "../src/analysis/qb-controversy.mjs";
import handler from "../netlify/functions/qb-optimizer.mjs";

const games=Array.from({length:5},(_,i)=>({season:2026,week:i+1,played:true,stats:{rec:5,rec_yd:50}}));
const snapshot={
 league:{id:"1312927511985807360",name:"QB Controversy",season:"2026",scoring_settings:{rec:1,rec_yd:.1,bonus_rec_te:.5},roster_positions:["WR","TE"]},
 my_team:{starters:[{player_id:"w1",name:"Receiver",position:"WR",team:"NYG"},{player_id:"t1",name:"Tight End",position:"TE",team:"NYJ"}],bench:[{player_id:"w2",name:"Missing Logs",position:"WR",team:"NYG"}]}
};
const cache={season:2026,generated_at:"2026-10-15T20:36:01Z",players:{w1:games,t1:games}};
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
