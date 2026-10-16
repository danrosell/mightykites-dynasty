// Exact assignment over a slot bitmask. Each player is considered once, so no
// player can fill two slots. Frozen starter slots are never moved or replaced.
const slotsByType={QB:['QB'],RB:['RB'],WR:['WR'],TE:['TE'],FLEX:['RB','WR','TE'],SUPER_FLEX:['QB','RB','WR','TE'],REC_FLEX:['WR','TE'],WRRB_FLEX:['WR','RB']};
export function optimizeLegalSlots(slots,players,{locked=[]}={}){
 if(!Array.isArray(slots)||!slots.length||slots.length>12||slots.some(s=>!slotsByType[s]))throw Error('Unsupported roster slots');
 if(!Array.isArray(players)||players.length>60)throw Error('Invalid candidate roster');
 const seen=new Set();
 for(const p of players){if(!p.player_id||seen.has(p.player_id)||!Number.isFinite(p.projected_points)||!['QB','RB','WR','TE'].includes(p.position))throw Error('Invalid or duplicate candidate');seen.add(p.player_id);}
 let initial=0;
 const frozen=new Set(),result=Array(slots.length).fill(null);
 for(const p of locked){if(!Number.isInteger(p.slot_index)||p.slot_index<0||p.slot_index>=slots.length||result[p.slot_index]||!p.player_id||frozen.has(p.player_id)||!slotsByType[slots[p.slot_index]].includes(p.position))throw Error('Invalid locked starter');frozen.add(p.player_id);initial|=1<<p.slot_index;result[p.slot_index]={...p,slot:slots[p.slot_index],locked:true,projected_points:null};}
 let dp=new Map([[initial,{points:0,node:null}]]);
 for(const p of [...players].sort((a,b)=>a.player_id.localeCompare(b.player_id))){
  if(frozen.has(p.player_id))continue;
  const next=new Map(dp);
  for(const [mask,state] of dp)for(let i=0;i<slots.length;i++){
   if(mask&(1<<i)||!slotsByType[slots[i]].includes(p.position))continue;
   const key=mask|(1<<i),points=state.points+Math.round(p.projected_points*100);
   if(!next.has(key)||points>next.get(key).points)next.set(key,{points,node:{p,slot_index:i,prev:state.node}});
  }
  dp=next;
 }
 const best=dp.get((1<<slots.length)-1);
 if(!best)return {ok:false,reason:'NO_COMPLETE_LEGAL_LINEUP'};
 for(let n=best.node;n;n=n.prev)result[n.slot_index]={...n.p,slot:slots[n.slot_index],slot_index:n.slot_index,locked:false};
 return {ok:true,method:'exact_slot_assignment_v1',remaining_projected_points:best.points/100,slots:result};
}
export function planVerifiedLineup(snapshot,players,verification,{now=Date.now(),availability=null}={}){
 const blocked=(reason,issues=[])=>({ok:false,reason,issues});
 if(!verification?.ok)return blocked('SCHEDULE_OR_IDENTITY_NOT_VERIFIED',verification?.issues||[]);
 const slots=(snapshot.league.roster_positions||[]).filter(s=>!['BN','IR','TAXI'].includes(s));
 const starters=snapshot.my_team.starters||[];
 if(!slots.length||slots.length>12||slots.some(s=>!slotsByType[s]))return blocked('UNSUPPORTED_ROSTER_SLOTS');
 if(starters.length!==slots.length)return blocked('STARTER_COUNT_MISMATCH');
 if(snapshot.league.settings?.best_ball||snapshot.league.settings?.max_subs)return blocked('UNSUPPORTED_LINEUP_RULES');
 const roster=[...starters,...(snapshot.my_team.bench||[])];
 if(players.length!==roster.length||new Set(players.map(p=>p.player_id)).size!==players.length||players.some(p=>!roster.some(r=>r.player_id===p.player_id)))return blocked('INCOMPLETE_CANDIDATE_ROSTER');
 const candidates=[],locked=[],issues=[];
 for(const p of players){
  const v=verification.players[p.player_id];
  if(!v){issues.push({code:'UNVERIFIED_PLAYER',player_id:p.player_id});continue;}
  const starterIndex=starters.findIndex(x=>x.player_id===p.player_id);
  if(v.started){if(starterIndex!==-1)locked.push({...p,slot_index:starterIndex});continue;}
  if(!v.has_game)continue;
  if(!['ACT','RES'].includes(v.status)){issues.push({code:'UNKNOWN_NFL_ROSTER_STATUS',player_id:p.player_id});continue;}
  // NFL roster ACT is not a game-day active declaration. No optimistic defaults.
  const a=availability?.players?.[p.player_id],stamp=Date.parse(availability?.generated_at);
  const fresh=Number.isFinite(stamp)&&stamp<=now+300000&&now-stamp<=90*60000;
  if(!fresh||availability?.season!==verification.season||availability?.week!==verification.week||!availability?.source||a?.confirmed!==true||a?.game_id!==v.game?.game_id||!['active','inactive'].includes(a?.status))issues.push({code:'AVAILABILITY_NOT_VERIFIED',player_id:p.player_id});
  else if(a.status==='inactive')continue;
  else if(v.status!=='ACT')issues.push({code:'ROSTER_AVAILABILITY_CONFLICT',player_id:p.player_id});
  if(p.projection?.ok!==true||!Number.isFinite(p.projection.projected_points))issues.push({code:'MISSING_PLAYER_PROJECTION',player_id:p.player_id});
  else candidates.push({player_id:p.player_id,name:p.name,position:p.position,projected_points:p.projection.projected_points});
 }
 if(!availability&&!issues.some(i=>i.code==='AVAILABILITY_NOT_VERIFIED'))issues.push({code:'AVAILABILITY_NOT_VERIFIED'});
 if(issues.length)return blocked('AVAILABILITY_OR_PROJECTIONS_NOT_VERIFIED',issues);
 try{return optimizeLegalSlots(slots,candidates,{locked});}catch(error){return blocked('INVALID_LINEUP_INPUTS',[{code:'INVALID_LINEUP_INPUTS',message:error.message}]);}
}
