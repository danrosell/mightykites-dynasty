const USERNAME="TheMightyKites";
const LEAGUES={
 "imperial":"1393340029132079104",
 "qb-controversy":"1312927511985807360",
 "jersey":"1312464433087250432",
 "tri-state":"1312173783108300800"
};
const API="https://api.sleeper.app/v1";
async function j(path){const r=await fetch(API+path);if(!r.ok)throw new Error(`${path}: ${r.status}`);return r.json()}
const pts=r=>Number((Number(r.settings?.fpts||0)+Number(r.settings?.fpts_decimal||0)/100).toFixed(2));
const record=r=>`${r.settings?.wins||0}-${r.settings?.losses||0}${r.settings?.ties?'-'+r.settings.ties:''}`;
export default async (request,context)=>{
 try{
  const url=new URL(request.url),slug=url.pathname.split("/").filter(Boolean).pop(),id=LEAGUES[slug];
  if(!id)return new Response(JSON.stringify({error:"Unknown league",valid:Object.keys(LEAGUES)}),{status:404,headers:{"content-type":"application/json"}});
  const [league,users,rosters,state,traded,players]=await Promise.all([j(`/league/${id}`),j(`/league/${id}/users`),j(`/league/${id}/rosters`),j("/state/nfl"),j(`/league/${id}/traded_picks`),j("/players/nfl")]);
  let matchups=[];try{matchups=await j(`/league/${id}/matchups/${state.week||1}`)}catch{}
  const userById=Object.fromEntries(users.map(u=>[u.user_id,u]));
  const teamName=r=>userById[r.owner_id]?.metadata?.team_name||userById[r.owner_id]?.display_name||`Roster ${r.roster_id}`;
  const po=id=>{const p=players[id]||{};return {player_id:id,name:p.full_name||[p.first_name,p.last_name].filter(Boolean).join(" ")||id,position:p.position||"—",team:p.team||"FA"}};
  const meUser=users.find(u=>(u.display_name||"").toLowerCase()===USERNAME.toLowerCase());
  const mine=rosters.find(r=>r.owner_id===meUser?.user_id);
  if(!mine)throw new Error(`Could not find ${USERNAME} roster`);
  const ranked=[...rosters].sort((a,b)=>(b.settings?.wins||0)-(a.settings?.wins||0)||pts(b)-pts(a));
  const teams=rosters.map(r=>{
   const starters=new Set(r.starters||[]),taxi=new Set(r.taxi||[]),reserve=new Set(r.reserve||[]);
   return {roster_id:r.roster_id,owner_id:r.owner_id,team_name:teamName(r),is_me:r.roster_id===mine.roster_id,record:record(r),wins:r.settings?.wins||0,losses:r.settings?.losses||0,points_for:pts(r),rank:ranked.findIndex(x=>x.roster_id===r.roster_id)+1,
    starters:(r.starters||[]).map(po),bench:(r.players||[]).filter(x=>!starters.has(x)&&!taxi.has(x)&&!reserve.has(x)).map(po),taxi:(r.taxi||[]).map(po),reserve:(r.reserve||[]).map(po)};
  });
  const myM=matchups.find(m=>m.roster_id===mine.roster_id),oppM=myM&&matchups.find(m=>m.matchup_id===myM.matchup_id&&m.roster_id!==mine.roster_id);
  const opponent=oppM&&teams.find(t=>t.roster_id===oppM.roster_id);
  const sy=Number(league.season),rounds=Number(league.settings?.draft_rounds||league.settings?.rounds||4),picks=[];
  for(let y=sy;y<=sy+3;y++)for(let round=1;round<=rounds;round++)for(const orig of rosters){
   const moved=traded.find(x=>String(x.season)===String(y)&&Number(x.round)===round&&Number(x.roster_id)===Number(orig.roster_id));
   const owner=moved?Number(moved.owner_id):Number(orig.roster_id);
   if(owner===Number(mine.roster_id))picks.push({season:String(y),round,original_roster_id:orig.roster_id,original_team:teamName(orig),is_own:Number(orig.roster_id)===Number(mine.roster_id)});
  }
  const body={generated_at:new Date().toISOString(),source:"Sleeper public API",username:USERNAME,nfl_week:state.week,league:{id:league.league_id,name:league.name,season:league.season,status:league.status,settings:league.settings,scoring_settings:league.scoring_settings,roster_positions:league.roster_positions},my_team:teams.find(t=>t.is_me),my_matchup:myM?{me:{team:teamName(mine),points:myM.points||0},opponent:{team:opponent?.team_name||"Opponent",points:oppM?.points||0,roster_id:oppM?.roster_id}}:null,my_picks:picks,teams};
  return new Response(JSON.stringify(body,null,2),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=60"}});
 }catch(e){return new Response(JSON.stringify({error:e.message}),{status:500,headers:{"content-type":"application/json"}})}
};