// Sleeper's live player metadata is the identity authority; the NFL schedule is separate.
// A schedule with no player map must not be treated as a verified lineup.
const API="https://api.sleeper.app/v1";
const TEAMS=new Set(["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"]);
async function get(path){const r=await fetch(API+path);if(!r.ok)throw new Error("Sleeper "+r.status+" "+path);return r.json()}
export function normalizeSchedule(raw,week){
  const games=raw.filter(g=>Number(g.week)===Number(week)).map(g=>({home:g.home,away:g.away,kickoff:g.kickoff}));
  if(!games.length)throw new Error("No games for week "+week);
  for(const g of games)if(!TEAMS.has(g.home)||!TEAMS.has(g.away)||!Number.isFinite(Date.parse(g.kickoff)))throw new Error("Invalid schedule game");
  return games;
}
// Caller supplies a verified current-week game list. This endpoint will not invent one.
export default async(request)=>{
 try{
  const url=new URL(request.url),week=Number(url.searchParams.get("week"));
  if(!Number.isInteger(week)||week<1||week>22)return Response.json({error:"Specify an NFL week 1-22"},{status:400});
  const players=await get("/players/nfl");
  const ids=(url.searchParams.get("ids")||"").split(",").filter(Boolean).slice(0,100);
  const result={};
  for(const id of ids){const p=players[id];if(p)result[id]={team:p.team||null,position:p.position||null,name:p.full_name||null,injury_status:p.injury_status||null};}
  return Response.json({generated_at:new Date().toISOString(),week,source:"Sleeper player metadata",players:result,note:"Player metadata only. Schedule and byes not yet verified; do not optimize from this response alone."},{headers:{"cache-control":"public, max-age=900"}});
 }catch(e){return Response.json({error:e.message},{status:502})}
};
