// Opt-in live audit. Without --origin, invoke the real functions locally while
// retaining live Sleeper requests. With --origin, validate the deployed routes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseCSV} from '../src/analysis/nflverse.mjs';
import leagueHandler from '../netlify/functions/league.mjs';
import optimizerHandler from '../netlify/functions/qb-optimizer.mjs';

const originIndex=process.argv.indexOf('--origin');
const deployed=originIndex!==-1;
const origin=deployed?new URL(process.argv[originIndex+1]).origin:'https://local-audit.invalid';
const nativeFetch=globalThis.fetch;
const get=async url=>{
 const r=await fetch(url,{signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error(`${url}: HTTP ${r.status}: ${(await r.text()).slice(0,500)}`);
 return r.json();
};
if(!deployed)globalThis.fetch=async (url,options)=>{
 const u=new URL(url);
 if(u.origin!==origin)return nativeFetch(url,options);
 if(u.pathname==='/api/league/qb-controversy')return leagueHandler(new Request(u));
 if(u.pathname==='/api/optimizer/qb-controversy')return optimizerHandler(new Request(u));
 if(u.pathname==='/data/historical-weekly.json')return new Response(await readFile(new URL('../data/historical-weekly.json',import.meta.url),'utf8'));
 throw Error('Unexpected local route '+u);
};
try{
 const api='https://api.sleeper.app/v1';
 const id='1312927511985807360';
 const [league,users,rosters,players,state,snapshot,cache,analysis]=await Promise.all([
  get(`${api}/league/${id}`),get(`${api}/league/${id}/users`),get(`${api}/league/${id}/rosters`),get(`${api}/players/nfl`),get(`${api}/state/nfl`),
  get(`${origin}/api/league/qb-controversy`),get(`${origin}/data/historical-weekly.json`),get(`${origin}/api/optimizer/qb-controversy`)
 ]);
 assert.equal(league.season,'2026');
 assert.equal(state.season,'2026');
 assert.equal(snapshot.league.id,id);
 assert.deepEqual(snapshot.league.scoring_settings,league.scoring_settings);
 assert.deepEqual(snapshot.league.roster_positions,league.roster_positions);
 assert.equal(snapshot.nfl_week,state.week);
 const user=users.find(u=>u.display_name.toLowerCase()==='themightykites');
 const roster=rosters.find(r=>r.owner_id===user.user_id);
 assert.equal(snapshot.my_team.roster_id,roster.roster_id);
 const activeIds=roster.players.filter(sid=>!roster.taxi?.includes(sid)&&!roster.reserve?.includes(sid));
 assert.deepEqual([...snapshot.my_team.starters,...snapshot.my_team.bench].map(p=>p.player_id).sort(),[...activeIds].sort());
 const eligible=activeIds.filter(sid=>['QB','RB','WR','TE'].includes(players[sid].position));
 assert.deepEqual(analysis.players.map(p=>p.player_id).sort(),[...eligible].sort());
 assert.equal(analysis.lineup.ok,false);
 assert.ok(['SCHEDULE_OR_IDENTITY_NOT_VERIFIED','AVAILABILITY_OR_PROJECTIONS_NOT_VERIFIED'].includes(analysis.lineup.reason));
 assert.equal(analysis.lineup.slots,undefined);
 assert.equal(analysis.cache_generated_at,cache.generated_at);
 assert.equal(cache.season,2026);
 assert.equal(analysis.through_week,state.week-1);
 assert.ok(Date.now()-Date.parse(cache.generated_at)<48*3600000);
 const source='https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv';
 assert.equal(cache.source,source);
 const csvResponse=await nativeFetch(source,{signal:AbortSignal.timeout(60000)});
 assert.equal(csvResponse.ok,true,'nflverse source unavailable');
 const rows=parseCSV(await csvResponse.text());
 const crossResponse=await nativeFetch('https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv',{signal:AbortSignal.timeout(60000)});
 assert.equal(crossResponse.ok,true,'ID crosswalk unavailable');
 const cross=parseCSV(await crossResponse.text());
 const fields={pass_yd:'passing_yards',pass_td:'passing_tds',pass_int:'passing_interceptions',rush_att:'carries',rush_yd:'rushing_yards',rush_td:'rushing_tds',rec:'receptions',rec_yd:'receiving_yards',rec_td:'receiving_tds',pass_2pt:'passing_2pt_conversions',rush_2pt:'rushing_2pt_conversions',rec_2pt:'receiving_2pt_conversions',fum_lost:'fumbles_lost_total',st_td:'special_teams_tds',fum_rec_td:'fumble_recovery_tds'};
 let projected=0;
 const reasons={};
 for(const p of analysis.players){
  assert.equal(p.name,players[p.player_id].full_name);
  assert.equal(p.position,players[p.player_id].position);
  assert.equal(p.team,players[p.player_id].team||'FA');
  const logs=cache.players[p.player_id];
  if(!logs){assert.equal(p.projection.ok,false);assert.equal(p.projection.reason,'NO_VERIFIED_GAME_LOGS');}
  else{
   const gsis=cache.identities[p.player_id];
   assert.ok(gsis,`Missing identity ${p.player_id}`);
   const direct=String(players[p.player_id].gsis_id||'').trim();
   const mapped=[...new Set(cross.filter(r=>r.sleeper_id?.trim()===p.player_id).map(r=>r.gsis_id?.trim()).filter(Boolean))];
   if(direct)assert.equal(gsis,direct);
   else assert.deepEqual(mapped,[gsis],`Ambiguous/unverified identity ${p.player_id}`);
   const observed=rows.filter(r=>r.player_id===gsis&&r.season==='2026'&&r.season_type==='REG');
   assert.equal(logs.length,observed.length,`Omitted/invented games ${p.player_id}`);
   for(const g of logs){
    const match=observed.filter(r=>Number(r.week)===g.week);
    assert.equal(match.length,1);
    assert.equal(g.season,2026);
    assert.equal(g.played,true);
    assert.ok(g.week<=state.week,'Future game');
    for(const [k,column] of Object.entries(fields)){
     assert.ok(match[0][column]?.trim(),`Missing source stat ${column}`);
     assert.equal(g.stats[k],Number(match[0][column]),`Stat mismatch ${p.player_id}/${g.week}/${k}`);
    }
   }
   const recent=observed.filter(r=>Number(r.week)<state.week).sort((a,b)=>Number(b.week)-Number(a.week)).slice(0,5);
   if(recent.length<3){assert.equal(p.projection.ok,false);assert.equal(p.projection.reason,'INSUFFICIENT_GAMES');}
   else{
    assert.equal(p.projection.ok,true);
    const weights=recent.map((_,i)=>0.85**i),denom=weights.reduce((a,b)=>a+b);
    let points=0;
    for(const [k,column] of Object.entries(fields)){
     const average=recent.reduce((sum,r,i)=>sum+Number(r[column])*weights[i],0)/denom;
     assert.ok(Math.abs(p.projection.projected_stats[k]-average)<1e-9);
     points+=average*(league.scoring_settings[k]||0);
     if(k==='rec')points+=average*(league.scoring_settings[`bonus_rec_${p.position.toLowerCase()}`]||0);
    }
    assert.equal(p.projection.projected_points,Math.round(points*100)/100,`Wrong scoring ${p.player_id}`);
    projected++;
   }
  }
  if(!p.projection.ok){assert.equal(p.projection.projected_points,undefined);reasons[p.projection.reason]=(reasons[p.projection.reason]||0)+1;}
 }
 assert.ok(projected>0,'No live projections validated');
 assert.equal(analysis.projected_players,projected);
 assert.equal(analysis.roster_players,eligible.length);
 console.log(JSON.stringify({checked_at:new Date().toISOString(),mode:deployed?origin:'local functions + live upstreams',league:league.name,roster_players:eligible.length,verified_projections:projected,unavailable:reasons,lineup_blocked:true,source_rows_compared:true},null,2));
}finally{globalThis.fetch=nativeFetch;}
