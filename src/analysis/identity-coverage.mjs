// Historical GSIS identity is diagnostic only: it cannot certify a current
// NFL roster row, team assignment, or game-day active/inactive designation.
const gsisPattern=/^00-\d{7}$/;
export function summarizeIdentityCoverage(snapshot,verification,historical){
 const roster=[...(snapshot?.my_team?.starters||[]),...(snapshot?.my_team?.bench||[])];
 const identities=historical?.identities||{},current=verification?.players||{};
 const players=roster.map(p=>{
  const v=current[p.player_id],gsis=identities[p.player_id];
  const historical_valid=typeof gsis==='string'&&gsisPattern.test(gsis);
  const current_valid=!!v?.verified&&typeof v.gsis_id==='string'&&gsisPattern.test(v.gsis_id)&&
   (!historical_valid||gsis===v.gsis_id);
  return {player_id:p.player_id,name:p.name,position:p.position,
   current_roster_verified:current_valid,historical_identity_found:historical_valid,
   gsis_id:current_valid?v.gsis_id:historical_valid?gsis:null,
   identity_conflict:!!v?.verified&&historical_valid&&v.gsis_id!==gsis,
   game_day_availability:'UNKNOWN',
   reason:current_valid?'CURRENT_INDEPENDENT_ROSTER_ROW':v?.verified?'HISTORICAL_CURRENT_ID_CONFLICT':historical_valid?'HISTORICAL_ONLY':'NO_INDEPENDENT_IDENTITY'};
 });
 return {total:players.length,current_verified:players.filter(p=>p.current_roster_verified).length,
  historical_only:players.filter(p=>p.reason==='HISTORICAL_ONLY').length,
  unresolved:players.filter(p=>p.reason==='NO_INDEPENDENT_IDENTITY'||p.identity_conflict).length,
  all_current_verified:players.every(p=>p.current_roster_verified),players};
}
