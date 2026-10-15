import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSchedule,parseEspnEvents} from "../netlify/functions/player-preflight.mjs";
test("only requested week included",()=>assert.equal(normalizeSchedule([{week:6,home:"DEN",away:"KC",kickoff:"2026-10-18T20:00:00Z"},{week:7,home:"DEN",away:"KC",kickoff:"2026-10-25T20:00:00Z"}],6).length,1));
test("reject invalid teams",()=>assert.throws(()=>normalizeSchedule([{week:6,home:"XXX",away:"KC",kickoff:"2026-10-18T20:00:00Z"}],6)));
test("reject missing schedule",()=>assert.throws(()=>normalizeSchedule([],6)));
test("ESPN WSH maps to Sleeper WAS",()=>{const games=parseEspnEvents([{id:"x",date:"2026-10-18T20:00:00Z",competitions:[{competitors:[{homeAway:"home",team:{abbreviation:"WSH"}},{homeAway:"away",team:{abbreviation:"NYG"}}]}]}],6);assert.equal(games[0].home,"WAS")});
test("missing competitor rejects schedule",()=>assert.throws(()=>parseEspnEvents([{competitions:[{competitors:[]}]}],6)));
test("schedule endpoint returns verified team assignments and byes from independent game feed",async()=>{
 const {default:handler}=await import("../netlify/functions/player-preflight.mjs");
 const original=globalThis.fetch;
 const teams=["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];
 const events=[];
 for(let i=0;i<15;i++)events.push({id:String(i),date:"2026-10-18T20:00:00Z",competitions:[{competitors:[{homeAway:"home",team:{abbreviation:teams[i*2]}},{homeAway:"away",team:{abbreviation:teams[i*2+1]}}]}]});
 globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes("espn.com")?{week:{number:6},events}:{"42":{full_name:"Jaylen Waddle",team:"DEN",position:"WR"}}});
 try{const response=await handler(new Request("https://example.com/?week=6&season=2026&ids=42"));const body=await response.json();assert.equal(response.status,200);assert.equal(body.players["42"].team,"DEN");assert.equal(body.games.length,15);assert.deepEqual(body.teams_without_game,["TEN","WAS"]);}finally{globalThis.fetch=original;}
});
