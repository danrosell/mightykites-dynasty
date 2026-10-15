import test from "node:test";
import assert from "node:assert/strict";
import {projectFromGameLogs} from "../src/analysis/projections.mjs";
const games=[1,2,3,4,5].map(week=>({season:2026,week,played:true,stats:{rec:5,rec_yd:50,rec_td:0}}));
test("TE premium is scored using league settings",()=>{
 const x=projectFromGameLogs(games,{rec:1,bonus_rec_te:0.5,rec_yd:0.1},{position:"TE"});
 assert.equal(x.ok,true);assert.equal(x.projected_points,12.5);
});
test("insufficient games do not yield invented projection",()=>assert.deepEqual(projectFromGameLogs(games.slice(0,1),{rec:1},{position:"WR"}).reason,"INSUFFICIENT_GAMES"));
test("rejects duplicate player game logs",()=>assert.throws(()=>projectFromGameLogs([...games,games[0]],{rec:1},{position:"WR"})));
test("rejects impossible numeric stat",()=>assert.throws(()=>projectFromGameLogs([{...games[0],stats:{rec:Infinity}},...games.slice(1)],{rec:1},{position:"WR"})));
test("recent games carry more weight",()=>{
 const changing=games.map((g,i)=>({...g,stats:{rec:i+1}}));
 const x=projectFromGameLogs(changing,{rec:1},{position:"WR"});
 assert.ok(x.projected_points>3);
});
