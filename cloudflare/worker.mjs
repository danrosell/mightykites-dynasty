import {createPlayerPreflightHandler} from '../netlify/functions/player-preflight.mjs';
import {createLeagueHandler} from '../netlify/functions/league.mjs';
import {buildQBControversyAnalysis} from '../src/analysis/qb-controversy.mjs';

const leagues=new Set(['imperial','qb-controversy','jersey','tri-state']);
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
// No paid bindings, AI calls, databases, queues or scheduled Workers.
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path.startsWith('/api/')||path.startsWith('/.netlify/functions/')){
   if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD'}});
   try{
    const asset=async name=>{
     const r=await env.ASSETS.fetch(new Request(new URL('/data/'+name+'.json',url)));
     if(!r.ok)throw Error('Published '+name+' asset unavailable');
     return r.json();
    };
    const upstreamFetch=async (input,options)=>{
     const upstream=new URL(input);
     if(upstream.origin==='https://api.sleeper.app'&&upstream.pathname==='/v1/players/nfl'){
      const metadata=await asset('player-metadata');
      const age=Date.now()-Date.parse(metadata.generated_at);
      if(!Number.isFinite(age)||age< -300000||age>26*3600000)throw Error('Player metadata expired; refresh deployment');
      return Response.json(metadata.players);
     }
     return fetch(input,{...options,signal:AbortSignal.timeout(15000)});
    };
    const leagueHandler=createLeagueHandler(upstreamFetch,{requirePlayerMetadata:true});
    const slug=path.startsWith('/api/league/')?path.slice('/api/league/'.length):path.startsWith('/.netlify/functions/league/')?path.slice('/.netlify/functions/league/'.length):null;
    let response;
    if(path==='/api/player-preflight'||path==='/.netlify/functions/player-preflight'){
     response=await createPlayerPreflightHandler(upstreamFetch)(request);
    }else if(slug!==null){
     if(!leagues.has(slug))return json({error:'Unknown league'},404);
     response=await leagueHandler(new Request(new URL('/api/league/'+slug,url)));
    }else if(path==='/api/optimizer/qb-controversy'||path==='/.netlify/functions/qb-optimizer'){
     // Internal calls use the assets binding and shared handler, never HTTP self-fetch.
     const [leagueResponse,cache]=await Promise.all([leagueHandler(new Request(new URL('/api/league/qb-controversy',url))),asset('historical-weekly')]);
     if(!leagueResponse.ok)throw Error('Live Sleeper league unavailable: '+(await leagueResponse.json()).error);
     response=json(buildQBControversyAnalysis(await leagueResponse.json(),cache));
    }else return json({error:'Unknown API endpoint'},404);
    return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
   }catch(error){return json({error:'Live analysis unavailable',detail:error.message},503);}
  }
  return env.ASSETS.fetch(request);
 }
};
