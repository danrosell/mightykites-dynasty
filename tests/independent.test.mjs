import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIndependentVerification,verifyLineupContext,NFL_TEAMS,ROSTER_SOURCE,SCHEDULE_SOURCE} from '../src/analysis/independent.mjs';
const now=Date.parse('2026-10-16T14:00:00Z'),stamp=new Date(now).toISOString();
const teams=[...NFL_TEAMS],pairs=Array.from({length:14},(_,i)=>({home:teams[i*2],away:teams[i*2+1]}));
const rosterHeader='season,week,game_type,sleeper_id,gsis_id,team,position,status\n';
const roster=rosterHeader+'2026,6,REG,1,00-001,ARI,WR,ACT\n';
const schedule='season,week,game_type,game_id,home_team,away_team,gameday,gametime\n'+pairs.map((p,i)=>`2026,6,REG,g${i},${p.home},${p.away},2026-10-18,13:00`).join('\n');
function fixture(){
 const independent=buildIndependentVerification(roster,schedule,{season:2026,week:6,ids:['1'],generated_at:stamp,expectedGsis:{'1':'00-001'}});
 const snapshot={generated_at:stamp,nfl_week:6,nfl_season:'2026',league:{season:'2026'},my_team:{starters:[{player_id:'1',team:'ARI',position:'WR'}],bench:[]}};
 const live={generated_at:stamp,season:2026,week:6,source:{schedule:'ESPN public scoreboard (undocumented)'},games:pairs.map((p,i)=>({...p,game_id:'espn'+i,game_state:'pre',kickoff:'2026-10-18T17:00:00Z'}))};
 return {independent,snapshot,live};
}
test('structured Sleeper/GSIS identities and both schedule feeds agree',()=>{
 const c=fixture(),r=verifyLineupContext(c.snapshot,c.independent,c.live,{now});assert.equal(r.ok,true);assert.equal(r.players['1'].team,'ARI');assert.equal(r.players['1'].started,false);assert.equal(c.independent.source.players,ROSTER_SOURCE);assert.equal(c.independent.source.schedule,SCHEDULE_SOURCE);
});
test('name-only, stale-week and missing player records never produce an identity',()=>{
 for(const csv of [roster.replace(',1,00-001,',',,00-001,'),roster.replace('2026,6','2026,5')]){
  const c=fixture();c.independent=buildIndependentVerification(csv,schedule,{season:2026,week:6,ids:['1'],generated_at:stamp});assert.equal(verifyLineupContext(c.snapshot,c.independent,c.live,{now}).ok,false);
 }
});
test('GSIS conflicts, duplicate identities and incomplete schedule are rejected at ingestion',()=>{
 for(const f of [()=>buildIndependentVerification(roster,schedule,{season:2026,week:6,ids:['1'],expectedGsis:{'1':'00-other'}}),()=>buildIndependentVerification(roster+roster.split('\n')[1]+'\n',schedule,{season:2026,week:6,ids:['1']}),()=>buildIndependentVerification(roster,schedule.split('\n').slice(0,10).join('\n'),{season:2026,week:6,ids:['1']})])assert.throws(f);
});
test('wrong week/year, timestamps, team/position mismatch and malformed schedules block verification',()=>{
 const mutations=[c=>c.live.season=2025,c=>c.independent.week=5,c=>c.snapshot.nfl_season='2025',c=>c.independent.generated_at='2000-01-01',c=>c.live.generated_at='2100-01-01',c=>c.snapshot.generated_at='bad',c=>c.independent.players['1'].team='MIA',c=>c.independent.players['1'].position='TE',c=>c.live.games.pop(),c=>c.live.games[0].kickoff='2026-10-18T18:00:00Z',c=>c.live.games[0].game_id='',c=>c.live.games[0].game_state='postponed',c=>c.independent.source.players='Sleeper',c=>c.snapshot.my_team.bench.push(c.snapshot.my_team.starters[0])];
 for(const mutate of mutations){const c=fixture();mutate(c);const r=verifyLineupContext(c.snapshot,c.independent,c.live,{now});assert.equal(r.ok,false,mutate.toString());}
});
test('started games are locked conservatively and absent teams are verified byes',()=>{
 const c=fixture();c.live.games[0].game_state='in';let r=verifyLineupContext(c.snapshot,c.independent,c.live,{now});assert.equal(r.players['1'].started,true);
 c.snapshot.my_team.starters[0].team='TEN';c.independent.players['1'].team='TEN';r=verifyLineupContext(c.snapshot,c.independent,c.live,{now});assert.equal(r.ok,true);assert.equal(r.players['1'].has_game,false);
});
