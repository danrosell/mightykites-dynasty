// Read-only live audit: compare published verification to fresh independent CSVs.
import assert from 'node:assert/strict';
import {parseCSV} from '../src/analysis/nflverse.mjs';
import {ROSTER_SOURCE,SCHEDULE_SOURCE} from '../src/analysis/independent.mjs';
const i=process.argv.indexOf('--origin');
if(i===-1)throw Error('Specify --origin http(s)://deployment');
const origin=new URL(process.argv[i+1]).origin;
async function read(url,type='json'){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});assert.equal(r.ok,true,`${url}: HTTP ${r.status}`);return type==='json'?r.json():r.text();}
const [snapshot,analysis,independent,schedule,rosterCSV,scheduleCSV]=await Promise.all([
 read(origin+'/api/league/qb-controversy'),read(origin+'/api/optimizer/qb-controversy'),read(origin+'/data/independent-verification.json'),read(origin+'/api/player-preflight'),read(ROSTER_SOURCE,'text'),read(SCHEDULE_SOURCE,'text')
]);
const cache=await read(origin+'/data/historical-weekly.json');
const v=analysis.verification,now=Date.now(),week=snapshot.nfl_week,season=Number(snapshot.league.season);
assert.ok(v&&Array.isArray(v.issues),'Missing verification report');
// nflverse may omit rostered players. That is an identity coverage gap, not
// permission to infer their identities or fail an otherwise valid deployment.
const gaps=v.issues.filter(x=>x.code==='UNVERIFIED_PLAYER');
const otherErrors=v.issues.filter(x=>x.severity==='error'&&x.code!=='UNVERIFIED_PLAYER');
assert.deepEqual(otherErrors,[],'Unexpected independent verification errors');
assert.equal(v.ok,gaps.length===0,'Verification must fail closed on coverage gaps');
assert.equal(v.week,week);assert.equal(v.season,season);
assert.equal(v.source.players,ROSTER_SOURCE);assert.equal(v.source.schedule,SCHEDULE_SOURCE);
for(const [stamp,max] of [[v.independent_at,2*3600000],[v.schedule_at,15*60000]]){const age=now-Date.parse(stamp);assert.ok(age>=-300000&&age<=max,'Stale/future verification');}
const rosters=parseCSV(rosterCSV).filter(r=>Number(r.season)===season&&Number(r.week)===week&&r.game_type==='REG');
const expected=parseCSV(scheduleCSV).filter(r=>Number(r.season)===season&&Number(r.week)===week&&r.game_type==='REG');
const norm=t=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[t]||t);
assert.equal(schedule.season,season);assert.equal(schedule.week,week);assert.equal(schedule.games.length,expected.length);assert.equal(independent.games.length,expected.length);
const clock=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
for(const g of schedule.games){
 const rows=expected.filter(r=>norm(r.home_team)===g.home&&norm(r.away_team)===g.away);assert.equal(rows.length,1);
 const parts=Object.fromEntries(clock.formatToParts(new Date(g.kickoff)).map(x=>[x.type,x.value]));
 assert.equal(`${parts.year}-${parts.month}-${parts.day}`,rows[0].gameday);assert.equal(`${parts.hour}:${parts.minute}`,rows[0].gametime);
}
const roster=[...snapshot.my_team.starters,...snapshot.my_team.bench];
assert.equal(Object.keys(v.players).length+gaps.length,roster.length,'Every roster player must be verified or explicitly flagged');
for(const p of roster){
 const rows=rosters.filter(r=>r.sleeper_id.trim()===p.player_id);
 if(rows.length===0){
  // Historical crosswalk can corroborate a Sleeper-to-GSIS identity, but it
  // cannot establish a current team, roster status or game-day availability.
  const gsis=cache.identities?.[p.player_id];
  assert.ok(typeof gsis==='string'&&/^00-\\d{7}$/.test(gsis),'Missing verified historical GSIS mapping '+p.player_id);
  assert.ok(gaps.some(g=>g.player_id===p.player_id),'Missing independent identity must block verification');
  assert.equal(v.players[p.player_id],undefined);
  continue;
 }
 assert.equal(rows.length,1,`Ambiguous identity ${p.player_id}`);
 const r=rows[0],verified=v.players[p.player_id];
 assert.ok(verified,'Matching independent record missing from verification');
 assert.equal(verified.gsis_id,r.gsis_id.trim());assert.equal(verified.team,norm(r.team));assert.equal(verified.position,r.position);assert.equal(verified.status,r.status);
 assert.equal(verified.team,p.team);assert.equal(verified.position,p.position);
 const game=schedule.games.find(g=>[g.home,g.away].includes(verified.team));
 assert.equal(verified.has_game,!!game);
 if(game){assert.equal(verified.game.game_id,game.game_id);assert.equal(verified.started,game.game_state==='in'||game.game_state==='post'||Date.parse(game.kickoff)<=Date.parse(v.checked_at));}
}
assert.equal(analysis.lineup.ok,false);assert.equal(analysis.lineup.reason,gaps.length?'SCHEDULE_OR_IDENTITY_NOT_VERIFIED':'AVAILABILITY_OR_PROJECTIONS_NOT_VERIFIED');assert.equal(analysis.lineup.slots,undefined);
if(gaps.length)assert.ok(analysis.lineup.issues.some(i=>i.code==='UNVERIFIED_PLAYER'));
else assert.ok(analysis.lineup.issues.some(i=>i.code==='AVAILABILITY_NOT_VERIFIED'));
console.log(JSON.stringify({checked_at:new Date().toISOString(),origin,season,week,verified_players:Object.keys(v.players).length,unverified_players:gaps.map(x=>{const p=roster.find(p=>p.player_id===x.player_id);return {player_id:x.player_id,name:p?.name||null,team_from_sleeper_unverified:p?.team||null,gsis_from_historical_crosswalk:cache.identities[x.player_id],reason:'MISSING_CURRENT_INDEPENDENT_ROSTER_ROW',game_day_availability:'UNKNOWN'};}),cross_checked_games:expected.length,locked_starters:snapshot.my_team.starters.filter(p=>v.players[p.player_id]?.started).map(p=>p.name),missing_eligible_projections:analysis.lineup.issues.filter(i=>i.code==='MISSING_PLAYER_PROJECTION').length,lineup_advice_blocked:true},null,2));
