import {buildQBControversyAnalysis} from "../../src/analysis/qb-controversy.mjs";

export default async (request) => {
 try {
  const origin=new URL(request.url).origin;
  const [leagueResponse,cacheResponse]=await Promise.all([
   fetch(new URL("/api/league/qb-controversy",origin),{headers:{accept:"application/json"}}),
   fetch(new URL("/data/historical-weekly.json",origin),{headers:{accept:"application/json"}})
  ]);
  if(!leagueResponse.ok || !cacheResponse.ok)throw Error("Sleeper league or historical cache unavailable");
  const [league,cache]=await Promise.all([leagueResponse.json(),cacheResponse.json()]);
  const analysis=buildQBControversyAnalysis(league,cache);
  return new Response(JSON.stringify(analysis),{headers:{"content-type":"application/json","cache-control":"no-store"}});
 } catch(e) {
  return new Response(JSON.stringify({error:"QB Controversy analysis unavailable",detail:e.message}),{
   status:503,headers:{"content-type":"application/json","cache-control":"no-store"}
  });
 }
};
