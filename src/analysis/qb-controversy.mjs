import {projectFromGameLogs} from "./projections.mjs";
import {validateLineupInputs} from "./validation.mjs";

const ACTIVE=new Set(["QB","RB","WR","TE"]);
export function buildQBControversyAnalysis(snapshot, cache, schedule=null, options={}) {
 if(!snapshot?.my_team || !snapshot?.league?.scoring_settings || !Array.isArray(snapshot.league.roster_positions))
  throw Error("Missing Sleeper league scoring or roster data");
 if(cache?.season!==Number(snapshot.league.season) || !cache?.generated_at || !cache?.players || typeof cache.players!=="object")
  throw Error("Missing or wrong-season historical statistics cache");
 const all=[...(snapshot.my_team.starters||[]),...(snapshot.my_team.bench||[])];
 const seen=new Set();
 const players=all.filter(p=>ACTIVE.has(p.position)).map(p=>{
  if(!p.player_id || seen.has(p.player_id))throw Error("Duplicate or missing Sleeper roster identity");
  seen.add(p.player_id);
  const logs=cache.players[p.player_id];
  if(!logs)return {...p,projection:{ok:false,reason:"NO_VERIFIED_GAME_LOGS"}};
  return {...p,projection:projectFromGameLogs(logs,snapshot.league.scoring_settings,{position:p.position})};
 });
 const validation=validateLineupInputs(snapshot,schedule,options);
 const eligible=players.filter(p=>p.projection.ok).length;
 return {
  league_id:snapshot.league.id,
  league_name:snapshot.league.name,
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
