import test from "node:test";
import assert from "node:assert/strict";
import {parseCSV,convertNflverseRows,requireVerifiedIdentity} from "../src/analysis/nflverse.mjs";
test("CSV handles quoted fields and escaped quotes",()=>assert.deepEqual(parseCSV('id,name\n1,"Smith, ""Jr"""\n'),[{id:"1",name:'Smith, "Jr"'}]));
test("nflverse rows become scoring categories",()=>{
 const rows=parseCSV("player_id,season,season_type,week,passing_yards,passing_tds,interceptions,carries,rushing_yards,rushing_tds,receptions,receiving_yards,receiving_tds\np1,2026,REG,6,0,0,0,2,10,0,5,60,1\n");
 assert.deepEqual(convertNflverseRows(rows,{season:2026,playerId:"p1"}),[{season:2026,week:6,played:true,stats:{pass_yd:0,pass_td:0,pass_int:0,rush_yd:10,rush_td:0,rush_att:2,rec:5,rec_yd:60,rec_td:1}}]);
});
test("unverified identity is rejected",()=>assert.throws(()=>requireVerifiedIdentity({"1":{nflverse_id:"p1",verified:false,source:"test"}},"1")));
test("verified identity resolves only explicit ID",()=>assert.equal(requireVerifiedIdentity({"1":{nflverse_id:"p1",verified:true,source:"verified mapping"}},"1"),"p1"));
test("duplicate weeks rejected",()=>{
 const rows=parseCSV("player_id,season,season_type,week\np1,2026,REG,6\np1,2026,REG,6\n");
 assert.throws(()=>convertNflverseRows(rows,{season:2026,playerId:"p1"}));
});
