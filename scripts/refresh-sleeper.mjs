// Refresh snapshots directly from Sleeper; no dependency on a hosting provider.
import {writeFile,rename,mkdir} from 'node:fs/promises';
import handler from '../netlify/functions/league.mjs';
await mkdir('data',{recursive:true});
const snapshots=[];
for(const slug of ['imperial','qb-controversy','jersey','tri-state']){
 const response=await handler(new Request('https://snapshot.invalid/api/league/'+slug));
 if(!response.ok)throw Error(`${slug} refresh failed: ${await response.text()}`);
 const body=await response.json();
 if(!body.my_team||!body.league?.id)throw Error('Incomplete snapshot '+slug);
 snapshots.push([slug,body]);
}
for(const [slug,body] of snapshots){await writeFile(`data/${slug}.json.tmp`,JSON.stringify(body,null,2)+'\n');await rename(`data/${slug}.json.tmp`,`data/${slug}.json`);}
console.log('Refreshed all four league snapshots directly from Sleeper');
