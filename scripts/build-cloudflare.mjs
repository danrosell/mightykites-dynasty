// Publish only explicitly selected site assets. No repository files or secrets.
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
const leagues=['1393340029132079104','1312927511985807360','1312464433087250432','1312173783108300800'];
const root=new URL('../',import.meta.url);
const api='https://api.sleeper.app/v1';
async function get(path){
 const r=await fetch(api+path,{signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error(`Sleeper ${path}: HTTP ${r.status}`);
 return r.json();
}
const [players,...rosters]=await Promise.all([get('/players/nfl'),...leagues.map(id=>get(`/league/${id}/rosters`))]);
const ids=new Set(rosters.flatMap(teams=>teams.flatMap(r=>[...(r.players||[]),...(r.starters||[]),...(r.reserve||[]),...(r.taxi||[])])).filter(id=>id!=='0'));
const compact={};
for(const id of ids){
 const p=players[id];
 if(!p?.position)throw Error('Missing Sleeper identity for roster player '+id);
 compact[id]={player_id:id,full_name:p.full_name||[p.first_name,p.last_name].filter(Boolean).join(' '),position:p.position,team:p.team||null,injury_status:p.injury_status||null};
}
const cache=JSON.parse(await readFile(new URL('data/historical-weekly.json',root),'utf8'));
const age=Date.now()-Date.parse(cache.generated_at);
if(cache.season!==2026||!cache.identities||!Number.isFinite(age)||age< -300000||age>48*3600000)throw Error('Refresh verified 2026 historical cache before building');
await mkdir(new URL('dist/data/',root),{recursive:true});
await copyFile(new URL('index.html',root),new URL('dist/index.html',root));
for(const name of ['historical-weekly','imperial','qb-controversy','jersey','tri-state'])await copyFile(new URL(`data/${name}.json`,root),new URL(`dist/data/${name}.json`,root));
await writeFile(new URL('dist/data/player-metadata.json',root),JSON.stringify({generated_at:new Date().toISOString(),source:'Sleeper public API',players:compact}));
console.log(`Prepared Cloudflare static assets and ${ids.size} explicit roster player identities`);
