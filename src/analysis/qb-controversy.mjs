import {projectFromGameLogs} from "./projections.mjs";
import {validateLineupInputs} from "./validation.mjs";

const ACTIVE=new Set(["QB","RB","WR","TE"]);
export function buildQBControversyAnalysis(snapshot, cache, schedule=null, options={}) {
 if(!snapshot?.my_team || !snapshot?.league?.scoring_settings || !Array.isArray(snapshot.league.roster_positions))
  throw Error("Missing Sleeper league scoring or roster data");
 if(!Number.isInteger(snapshot.nfl_week)||snapshot.nfl_week<1||snapshot.nfl_week>18)throw Error("Missing current NFL week");
 if(snapshot.league.id!=="1312927511985807360")throw Error("Wrong league identity");
 if(cache?.season!==Number(snapshot.league.season) || !cache?.generated_at || !cache?.players || typeof cache.players!=="object")
  throw Error("Missing or wrong-season historical statistics cache");
 const now=options.now??Date.now();
 const stamp=Date.parse(cache.generated_at);
 if(!Number.isFinite(stamp)||stamp>now+300000||now-stamp>48*3600000)throw Error("Stale or invalid historical cache timestamp");
 const ignored=new Set(["sack","fgm_40_49","pts_allow_0","fgm_30_39","xpmiss","st_fum_rec","fgmiss","ff","pts_allow_14_20","fgm_0_19","pts_allow_1_6","fgm_20_29","pts_allow_21_27","xpm","fum_rec","def_st_td","fgm_50p","def_td","safe","blk_kick","pts_allow_28_34","pts_allow_35p","def_st_ff","pts_allow_7_13","int","def_st_fum_rec","st_ff"]);
 const supported=new Set(["pass_yd","pass_td","pass_int","pass_2pt","rush_yd","rush_td","rush_att","rush_2pt","rec","rec_yd","rec_td","rec_2pt","fum_lost","st_td","fum_rec_td","bonus_rec_te","bonus_rec_wr","bonus_rec_rb"]);
 for(const [key,value] of Object.entries(snapshot.league.scoring_settings)){
  if(!Number.isFinite(value))throw Error("Invalid scoring setting: "+key);
  if(value!==0&&!supported.has(key)&&!ignored.has(key))throw Error("Unsupported scoring setting: "+key);
 }
 const all=[...(snapshot.my_team.starters||[]),...(snapshot.my_team.bench||[])];
 const seen=new Set();
 const players=all.filter(p=>ACTIVE.has(p.position)).map(p=>{
  if(!p.player_id || seen.has(p.player_id))throw Error("Duplicate or missing Sleeper roster identity");
  seen.add(p.player_id);
  const logs=cache.players[p.player_id];
  if(!logs)return {...p,projection:{ok:false,reason:"NO_VERIFIED_GAME_LOGS"}};
  if(!cache.identities?.[p.player_id])return {...p,projection:{ok:false,reason:"NO_VERIFIED_CACHE_IDENTITY"}};
  if(!Array.isArray(logs)||logs.some(g=>g.season!==cache.season||!Number.isInteger(g.week)||g.week>snapshot.nfl_week||g.played!==true))throw Error("Invalid season or unfinished game in cache");
  return {...p,projection:projectFromGameLogs(logs.filter(g=>g.week<snapshot.nfl_week),snapshot.league.scoring_settings,{position:p.position,requireComplete:true})};
 });
 const validation=validateLineupInputs(snapshot,schedule,options);
 const eligible=players.filter(p=>p.projection.ok).length;
 return {
  league_id:snapshot.league.id,
  league_name:snapshot.league.name,
  through_week:snapshot.nfl_week-1,
  cache_source:cache.source,
  cache_generated_at:cache.generated_at,
  roster_players:players.length,
  projected_players:eligible,
  players,
  lineup:{ok:false,reason:validation.ok?"OPTIMIZER_NOT_YET_VERIFIED":"SCHEDULE_OR_IDENTITY_NOT_VERIFIED",issues:validation.issues},
  // No lineup advice until a verified schedule, complete eligibility checks,
  // and a separately tested legal-slot optimizer are all connected.
  methodology:"Verified 2026 game logs, league-specific scoring; no opponent/injury adjustment"
 };
}
