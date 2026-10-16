import {parseCSV} from './nflverse.mjs';
export const ROSTER_SOURCE='https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv';
export const SCHEDULE_SOURCE='https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
export const NFL_TEAMS=new Set(['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS']);
const aliases={LA:'LAR',JAC:'JAX',WSH:'WAS'};
const team=x=>aliases[x]||x;
const required=(rows,keys)=>{if(!rows.length||keys.some(k=>!(k in rows[0])))throw Error('Unexpected independent feed schema');};
export function buildIndependentVerification(rosterCSV,scheduleCSV,{season,week,ids,expectedGsis={},generated_at=new Date().toISOString()}={}){
 if(season!==2026||!Number.isInteger(week)||week<1||week>18||!Array.isArray(ids))throw Error('Invalid verification context');
 const rosters=parseCSV(rosterCSV),schedule=parseCSV(scheduleCSV);
 required(rosters,['season','week','game_type','sleeper_id','gsis_id','team','position','status']);
 required(schedule,['season','week','game_type','game_id','away_team','home_team','gameday','gametime']);
 const current=rosters.filter(r=>Number(r.season)===season&&Number(r.week)===week&&r.game_type==='REG');
 const players={},used=new Map();
 for(const id of ids){
  const matches=current.filter(r=>r.sleeper_id.trim()===id);
  if(matches.length>1)throw Error('Ambiguous independent player identity '+id);
  if(!matches.length)continue;
  const r=matches[0],gsis=r.gsis_id.trim();
  if(!gsis||!NFL_TEAMS.has(team(r.team))||!r.position||!r.status)throw Error('Incomplete independent player record '+id);
  if(expectedGsis[id]&&expectedGsis[id]!==gsis)throw Error('Independent GSIS identity mismatch '+id);
  if(used.has(gsis)&&used.get(gsis)!==id)throw Error('GSIS identity maps to multiple Sleeper IDs');
  used.set(gsis,id);
  players[id]={team:team(r.team),position:r.position,gsis_id:gsis,status:r.status,verified:true};
 }
 const games=schedule.filter(r=>Number(r.season)===season&&Number(r.week)===week&&r.game_type==='REG').map(r=>({game_id:r.game_id,home:team(r.home_team),away:team(r.away_team),local_date:r.gameday,local_time:r.gametime}));
 if(games.length<12||games.length>16)throw Error('Incomplete independent weekly schedule');
 const teams=games.flatMap(g=>[g.home,g.away]);
 if(teams.some(t=>!NFL_TEAMS.has(t))||new Set(teams).size!==teams.length||new Set(games.map(g=>g.game_id)).size!==games.length||games.some(g=>!g.game_id||!/^\d{4}-\d{2}-\d{2}$/.test(g.local_date)||!/^\d\d:\d\d$/.test(g.local_time)))throw Error('Invalid independent schedule');
 return {generated_at,season,week,source:{players:ROSTER_SOURCE,schedule:SCHEDULE_SOURCE},players,games};
}
const localClock=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function clock(stamp){const p=Object.fromEntries(localClock.formatToParts(new Date(stamp)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};}
export function verifyLineupContext(snapshot,independent,schedule,{now=Date.now()}={}){
 const issues=[],by_player={},error=(code,player_id)=>issues.push({severity:'error',code,...(player_id?{player_id}:{})});
 const fresh=(stamp,maxAge)=>{const ms=Date.parse(stamp);return Number.isFinite(ms)&&ms<=now+300000&&now-ms<=maxAge;};
 const season=Number(snapshot?.league?.season),week=snapshot?.nfl_week;
 if(!fresh(snapshot?.generated_at,5*60000))error('STALE_ROSTER');
 if(!fresh(independent?.generated_at,2*3600000))error('STALE_INDEPENDENT_ROSTER');
 if(!fresh(schedule?.generated_at,15*60000))error('STALE_SCHEDULE');
 if(snapshot?.nfl_season!==undefined&&Number(snapshot.nfl_season)!==season)error('WRONG_NFL_STATE_SEASON');
 if(independent?.season!==season||independent?.week!==week||schedule?.season!==season||schedule?.week!==week)error('WRONG_VERIFICATION_WEEK_OR_SEASON');
 if(independent?.source?.players!==ROSTER_SOURCE||independent?.source?.schedule!==SCHEDULE_SOURCE)error('UNVERIFIED_SOURCE');
 const expected=independent?.games||[],actual=schedule?.games||[];
 if(expected.length<12||actual.length!==expected.length)error('INCOMPLETE_SCHEDULE');
 if(schedule?.source?.schedule!=="ESPN public scoreboard (undocumented)")error('UNVERIFIED_LIVE_SCHEDULE_SOURCE');
 const gamesByTeam=new Map(),gameIds=new Set();
 for(const g of actual){
  const kickoff=Date.parse(g.kickoff),match=expected.filter(x=>x.home===g.home&&x.away===g.away);
  if(!g.game_id||gameIds.has(g.game_id)||!['pre','in','post'].includes(g.game_state)||!NFL_TEAMS.has(g.home)||!NFL_TEAMS.has(g.away)||g.home===g.away||!Number.isFinite(kickoff)||match.length!==1){error('INVALID_SCHEDULE_GAME');continue;}
  gameIds.add(g.game_id);
  const local=clock(kickoff);
  if(local.date!==match[0].local_date||local.time!==match[0].local_time)error('SCHEDULE_KICKOFF_MISMATCH');
  for(const t of [g.home,g.away]){if(gamesByTeam.has(t))error('DUPLICATE_SCHEDULE_TEAM');gamesByTeam.set(t,g);}
 }
 const roster=[...(snapshot?.my_team?.starters||[]),...(snapshot?.my_team?.bench||[])],seen=new Set();
 for(const p of roster){
  if(!p.player_id||p.player_id==='0'){error('EMPTY_ROSTER_ID');continue;}
  if(seen.has(p.player_id))error('DUPLICATE_PLAYER',p.player_id);seen.add(p.player_id);
  const verified=independent?.players?.[p.player_id];
  if(!verified?.verified||!verified.gsis_id||!NFL_TEAMS.has(verified.team)||!['QB','RB','WR','TE'].includes(verified.position)){error('UNVERIFIED_PLAYER',p.player_id);continue;}
  if(verified.team!==p.team)error('TEAM_MISMATCH',p.player_id);
  if(verified.position!==p.position)error('POSITION_MISMATCH',p.player_id);
  const game=gamesByTeam.get(verified.team);
  by_player[p.player_id]={...verified,game:game||null,has_game:!!game,started:!!game&&(game.game_state==='in'||game.game_state==='post'||Date.parse(game.kickoff)<=now)};
 }
 return {ok:!issues.some(i=>i.severity==='error'),issues,players:by_player,season,week,checked_at:new Date(now).toISOString(),independent_at:independent?.generated_at||null,schedule_at:schedule?.generated_at||null,source:independent?.source||null};
}
