// Normalize explicitly published NFL game-day decisions. This adapter does not
// infer active status from roster membership or omission from an inactive list.
// Upstream retrieval and authenticity verification are intentionally separate.
export function normalizeOfficialAvailability(records,{season,week,generated_at,source_url}={}){
 if(!Number.isInteger(season)||!Number.isInteger(week)||week<1||week>18||!Number.isFinite(Date.parse(generated_at))||
  typeof source_url!=='string'||!/^https:\/\/(www\.)?nfl\.com\//.test(source_url)||!Array.isArray(records))throw Error('Invalid official availability metadata');
 const players={};
 for(const r of records){
  if(!r||typeof r.player_id!=='string'||!r.player_id||typeof r.game_id!=='string'||!r.game_id||
   !['active','inactive'].includes(r.status)||r.explicit!==true||!Number.isFinite(Date.parse(r.reported_at)))throw Error('Missing explicit game-day decision');
  if(players[r.player_id])throw Error('Conflicting or duplicate game-day decision');
  players[r.player_id]={status:r.status,game_id:r.game_id,confirmed:true,
   evidence_type:r.status==='active'?'EXPLICIT_ACTIVE':'EXPLICIT_INACTIVE',reported_at:r.reported_at,source_url};
 }
 return {source:'NFL_OFFICIAL_GAME_DAY_STATUS',season,week,generated_at,players};
}
