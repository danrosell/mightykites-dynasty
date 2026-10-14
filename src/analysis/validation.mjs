// Dynasty HQ: strict preflight checks. No player is declared available from a roster snapshot alone.
// All schedule/team assignments must come from a separately refreshed, timestamped NFL schedule feed.
export function validateLineupInputs(snapshot, schedule, {maxAgeHours=24, now=Date.now()}={}) {
  const issues=[];
  if (!snapshot?.my_team || !snapshot?.league?.roster_positions) issues.push({severity:"error",code:"MISSING_ROSTER",message:"Missing Sleeper roster or slot definitions"});
  if (!schedule?.generated_at || !Array.isArray(schedule?.games)) issues.push({severity:"error",code:"MISSING_SCHEDULE",message:"No verified NFL schedule supplied"});
  const stamp=Date.parse(schedule?.generated_at||"");
  if (!Number.isFinite(stamp)||now-stamp>maxAgeHours*3600000||stamp>now+300000) issues.push({severity:"error",code:"STALE_SCHEDULE",message:"Schedule is missing, stale, or future dated"});
  const games=schedule?.games||[];
  const byTeam=new Map();
  for(const game of games) {
    if(!game.home||!game.away||!game.kickoff) {issues.push({severity:"error",code:"INVALID_GAME",message:"Incomplete schedule game"});continue;}
    for(const team of [game.home,game.away]){
      if(byTeam.has(team))issues.push({severity:"error",code:"DUPLICATE_TEAM",message:team+" appears in multiple games"});
      byTeam.set(team,game);
    }
  }
  const all=[...(snapshot?.my_team?.starters||[]),...(snapshot?.my_team?.bench||[])];
  const playerIds=new Set();
  for(const player of all){
    if(playerIds.has(player.player_id))issues.push({severity:"error",code:"DUPLICATE_PLAYER",player:player.name});
    playerIds.add(player.player_id);
    const official=schedule?.players?.[player.player_id];
    if(!official?.team || !official?.position){
      issues.push({severity:"error",code:"UNVERIFIED_PLAYER",player:player.name,message:"No independent current NFL team/position mapping"});
      continue;
    }
    if(official.team!==player.team)issues.push({severity:"error",code:"TEAM_MISMATCH",player:player.name,message:"Sleeper "+player.team+" versus verified "+official.team});
    if(official.position!==player.position)issues.push({severity:"error",code:"POSITION_MISMATCH",player:player.name});
    if(!byTeam.has(official.team))issues.push({severity:"info",code:"BYE_OR_NO_GAME",player:player.name,message:official.team+" has no game on verified schedule"});
  }
  const starters=snapshot?.my_team?.starters||[];
  const slots=(snapshot?.league?.roster_positions||[]).filter(x=>!["BN","IR","TAXI"].includes(x));
  if(starters.length!==slots.length)issues.push({severity:"error",code:"STARTER_COUNT",message:"Starter count does not match active slots"});
  return {ok:!issues.some(x=>x.severity==="error"),issues,checked_at:new Date(now).toISOString(),schedule_at:schedule?.generated_at||null};
}
export function scoreProjectedStats(stats={},scoring={}) {
  // The Sleeper scoring keys are multipliers per event; never assume generic PPR.
  const keys=["pass_yd","pass_td","pass_int","pass_2pt","rush_yd","rush_td","rush_att","rush_2pt","rec","rec_yd","rec_td","rec_2pt","fum_lost"];
  let total=keys.reduce((n,k)=>n+(Number(stats[k]||0)*Number(scoring[k]||0)),0);
  const position=stats.position;
  if(position==="TE")total+=Number(stats.rec||0)*Number(scoring.bonus_rec_te||0);
  if(position==="WR")total+=Number(stats.rec||0)*Number(scoring.bonus_rec_wr||0);
  if(position==="RB")total+=Number(stats.rec||0)*Number(scoring.bonus_rec_rb||0);
  return Math.round(total*100)/100;
}
