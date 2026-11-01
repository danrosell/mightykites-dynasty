// Historical Sleeper matchup archive. Keeps actual starters and all player scores
// separate from current rosters, which can change after trades and waivers.
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export const LEAGUES={imperial:'1393340029132079104','qb-controversy':'1312927511985807360',jersey:'1312464433087250432','tri-state':'1312173783108300800'};
const API='https://api.sleeper.app/v1';
async function json(fetcher,path){
 const response=await fetcher(API+path);
 if(!response.ok)throw Error(path+': HTTP '+response.status);
 return response.json();
}
export async function buildHistory(slug,{fetcher=fetch,read=readFile}={}){
 const id=LEAGUES[slug];if(!id)throw Error('Unknown league: '+slug);
 const league=await json(fetcher,'/league/'+id);
 const season=Number(league.season);
 const [state,rosters,users]=await Promise.all([
  json(fetcher,'/state/nfl'),
  json(fetcher,'/league/'+id+'/rosters'),
  json(fetcher,'/league/'+id+'/users')
 ]);
 const lastCompleted=Math.min(18,Math.max(0,Number(league.settings?.last_scored_leg||0)));
 const user=users.find(u=>(u.display_name||'').toLowerCase()==='themightykites');
 const myRoster=rosters.find(r=>r.owner_id===user?.user_id);
 if(!myRoster)throw Error('Owner roster missing for '+slug);
 let old={};try{old=JSON.parse(await read('data/history/'+slug+'.json','utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 const weeks={...(old.season===season?old.weeks:{})};
 for(let week=1;week<=lastCompleted;week++){
  // Previously archived results remain immutable unless explicitly re-fetched.
  if(weeks[week]?.status==='complete')continue;
  const matches=await json(fetcher,'/league/'+id+'/matchups/'+week);
  const mine=matches.find(m=>m.roster_id===myRoster.roster_id);
  if(!mine)throw Error('No matchup for '+slug+' week '+week);
  const opponent=matches.find(m=>m.matchup_id===mine.matchup_id&&m.roster_id!==mine.roster_id);
  const normalize=m=>m&&({roster_id:m.roster_id,matchup_id:m.matchup_id,points:m.points,
   starters:m.starters||[],starters_points:m.starters_points||[],players:m.players||[],
   players_points:m.players_points||{},custom_points:m.custom_points||{}});
  weeks[week]={status:'complete',week,me:normalize(mine),opponent:normalize(opponent)};
 }
 return {source:'Sleeper public API',league_id:id,league_name:league.name,season,
  roster_positions:league.roster_positions,scoring_settings:league.scoring_settings,
  my_roster_id:myRoster.roster_id,last_completed_week:lastCompleted,weeks};
}
export async function refreshHistory({fetcher=fetch}={}){
 await mkdir('data/history',{recursive:true});
 for(const slug of Object.keys(LEAGUES)){
  const data=await buildHistory(slug,{fetcher});
  const dest='data/history/'+slug+'.json';
  await writeFile(dest+'.tmp',JSON.stringify(data,null,2)+'\n');
  await rename(dest+'.tmp',dest);
  console.log(slug+': archived '+Object.keys(data.weeks).length+' completed weeks');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 refreshHistory().catch(e=>{console.error(e);process.exitCode=1});
}
