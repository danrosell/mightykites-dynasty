// Diagnostic only. No missing games or statistics are fabricated.
const allowed=new Set(['QB','RB','WR','TE']);
export function summarizeProjectionCoverage(analysis,cache){
 const players=Array.isArray(analysis?.players)?analysis.players:[];
 const reasons={},missing_players=[],details=[];
 const cutoff=Number(analysis?.through_week);
 for(const p of players){
  if(!allowed.has(p.position))continue;
  const logs=cache?.players?.[p.player_id];
  const historical_identity=cache?.identities?.[p.player_id]||null;
  const prior=Array.isArray(logs)?logs.filter(g=>Number.isInteger(g.week)&&g.week<=cutoff&&g.played===true):[];
  const weeks=[...new Set(prior.map(g=>g.week))].sort((a,b)=>a-b);
  const projection=p.projection||{ok:false,reason:'MISSING_PROJECTION_RESULT'};
  const reason=projection.ok===true?null:projection.reason||'MISSING_PROJECTION_RESULT';
  if(reason){reasons[reason]=(reasons[reason]||0)+1;missing_players.push({player_id:p.player_id,name:p.name,position:p.position,reason,stat:projection.stat||null,week:projection.week??null,observed_games:prior.length,observed_weeks:weeks,historical_identity_found:!!historical_identity});}
  details.push({player_id:p.player_id,name:p.name,position:p.position,projection_ok:projection.ok===true,reason,observed_games:prior.length,observed_weeks:weeks,historical_identity_found:!!historical_identity});
 }
 return {total:details.length,projected:details.length-missing_players.length,missing:missing_players.length,reasons,missing_players,players:details,verified_for_optimizer:false,notes:'Observed game logs only. Unobserved weeks may be byes, injuries or missing source rows; no cause is inferred.'};
}
