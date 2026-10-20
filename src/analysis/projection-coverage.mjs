// Diagnostic only. Coverage counts do not certify accuracy or permit lineup advice.
export function summarizeProjectionCoverage(analysis){
 const players=Array.isArray(analysis?.players)?analysis.players:[];
 const reasons={};
 const missing=players.filter(p=>p.projection?.ok!==true).map(p=>{
  const reason=p.projection?.reason||'MISSING_PROJECTION_RESULT';
  reasons[reason]=(reasons[reason]||0)+1;
  return {player_id:p.player_id,name:p.name,position:p.position,reason};
 });
 return {total:players.length,projected:players.length-missing.length,missing:missing.length,reasons,missing_players:missing,verified_for_optimizer:false};
}
