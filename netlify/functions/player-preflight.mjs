// Sleeper's live player metadata is the identity authority; the NFL schedule is separate.
// A schedule with no player map must not be treated as a verified lineup.
const API="https://api.sleeper.app/v1";
const TEAMS=new Set(["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"]);
async function get(path){const r=await fetch(API+path);if(!r.ok)throw new Error("Sleeper "+r.status+" "+path);return r.json()}
export function normalizeSchedule(raw,week){
  const games=raw.filter(g=>Number(g.week)===Number(week)).map(g=>({home:g.home,away:g.away,kickoff:g.kickoff}));
  if(games.length<12||games.length>16)throw new Error("Incomplete or invalid NFL schedule for week "+week);
  for(const g of games)if(!TEAMS.has(g.home)||!TEAMS.has(g.away)||!Number.isFinite(Date.parse(g.kickoff)))throw new Error("Invalid schedule game");
  return games;
}
// ESPN's public scoreboard endpoint is used for the independent schedule.
// It is undocumented and may change. Fail closed rather than guess byes.
const ESPN="https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const alias={WSH:"WAS",JAC:"JAX",LA:"LAR"};
export function parseEspnEvents(events,week){
 const games=[];
 for(const event of events||[]){
  const comp=event.competitions?.[0],teams=comp?.competitors||[];
  const home=teams.find(x=>x.homeAway==="home"),away=teams.find(x=>x.homeAway==="away");
  const norm=x=>alias[x?.team?.abbreviation]||x?.team?.abbreviation;
  if(!home||!away)throw new Error("Missing competitors");
  games.push({week,home:norm(home),away:norm(away),kickoff:comp.date||event.date,game_id:event.id});
 }
 return normalizeSchedule(games,week);
}
export default async(request)=>{
 try{
  const url=new URL(request.url),week=Number(url.searchParams.get("week")),season=Number(url.searchParams.get("season"));
  if(!Number.isInteger(week)||week<1||week>18||!Number.isInteger(season)||season<2020||season>2100)
    return Response.json({error:"Specify NFL regular season and week 1-18"},{status:400});
  const [raw,players]=await Promise.all([
    fetch(ESPN+"?dates="+season+"&seasontype=2&week="+week).then(r=>{if(!r.ok)throw Error("ESPN schedule HTTP "+r.status);return r.json()}),
    get("/players/nfl")
  ]);
  if(Number(raw.week?.number)!==week)throw new Error("ESPN returned a different week");
  const games=parseEspnEvents(raw.events,week);
  const ids=(url.searchParams.get("ids")||"").split(",").filter(Boolean).slice(0,100);
  const result={};
  for(const id of ids){const p=players[id];if(p)result[id]={team:p.team||null,position:p.position||null,name:p.full_name||null,injury_status:p.injury_status||null};}
  const byTeam=new Set(games.flatMap(g=>[g.home,g.away]));
  const noGame=[...TEAMS].filter(t=>!byTeam.has(t));
  return Response.json({generated_at:new Date().toISOString(),season,week,source:{schedule:"ESPN public scoreboard (undocumented)",players:"Sleeper player metadata"},games,teams_without_game:noGame,players:result,note:"Injury status is informational, not official inactive confirmation. If source fails, do not optimize."},{headers:{"cache-control":"public, max-age=900"}});
 }catch(e){return Response.json({error:e.message,verified:false},{status:502})}
};
