import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHistory} from '../scripts/refresh-sleeper-history.mjs';
test('archives actual historical starters and bench points without using current roster',async()=>{
 const routes={
  '/league/1312173783108300800':{name:'Tri State',season:'2026',settings:{last_scored_leg:7},roster_positions:['QB','SUPER_FLEX'],scoring_settings:{pass_yd:0.04}},
  '/state/nfl':{week:8},
  '/league/1312173783108300800/rosters':[{roster_id:3,owner_id:'owner'}],
  '/league/1312173783108300800/users':[{user_id:'owner',display_name:'TheMightyKites'}],
  '/league/1312173783108300800/matchups/7':[
   {roster_id:3,matchup_id:1,points:25,starters:['qb1'],starters_points:[25],players:['qb1','qb2'],players_points:{qb1:25,qb2:35}},
   {roster_id:4,matchup_id:1,points:30,starters:['qb3'],starters_points:[30],players:['qb3'],players_points:{qb3:30}}
  ]
 };
 const fetcher=async url=>{const path=new URL(url).pathname.replace('/v1','');return {ok:!!routes[path],status:routes[path]?200:404,json:async()=>routes[path]}};
 const read=async()=>JSON.stringify({season:2026,weeks:Object.fromEntries(Array.from({length:6},(_,i)=>[i+1,{status:'complete'}]))});
 const history=await buildHistory('tri-state',{fetcher,read});
 assert.equal(history.weeks[7].me.players_points.qb2,35);
 assert.deepEqual(history.weeks[7].me.starters,['qb1']);
 assert.equal(history.weeks[7].opponent.points,30);
 assert.equal(history.last_completed_week,7);
});
test('does not silently treat incomplete historical data as complete',async()=>{
 const fetcher=async url=>{const path=new URL(url).pathname.replace('/v1','');const value=path.includes('/matchups/')?[]:path==='/state/nfl'?{}:path.endsWith('/rosters')?[{roster_id:3,owner_id:'a'}]:path.endsWith('/users')?[{user_id:'a',display_name:'TheMightyKites'}]:{season:'2026',settings:{last_scored_leg:1}};return {ok:true,json:async()=>value}};
 await assert.rejects(()=>buildHistory('tri-state',{fetcher,read:async()=>{throw Object.assign(Error(),{code:'ENOENT'})}}),/No matchup/);
});
