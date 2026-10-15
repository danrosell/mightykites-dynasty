import {scoreProjectedStats} from "./validation.mjs";

// Projection baseline: observed game logs only. Never invent missing games or stats.
// This module does not provide opponent, injury or weather adjustments yet.
const KEYS=["pass_yd","pass_td","pass_int","pass_2pt","rush_yd","rush_td","rush_att","rush_2pt","rec","rec_yd","rec_td","rec_2pt","fum_lost"];
const POS=new Set(["QB","RB","WR","TE"]);
export function projectFromGameLogs(logs,scoring,{position,lookback=5,minGames=3}={}){
 if(!POS.has(position))throw new Error("Unsupported position");
 if(!Array.isArray(logs)||!Number.isInteger(lookback)||lookback<1||!Number.isInteger(minGames)||minGames<1)throw new Error("Invalid projection inputs");
 const valid=logs.filter(g=>g&&Number.isInteger(g.week)&&g.week>=1&&g.week<=18&&g.season>=2020&&g.season<=2100&&g.played===true);
 const keys=new Set();
 for(const g of valid){const k=g.season+":"+g.week;if(keys.has(k))throw new Error("Duplicate player game");keys.add(k);
  for(const stat of KEYS)if(g.stats?.[stat]!==undefined&&(!Number.isFinite(g.stats[stat])||Math.abs(g.stats[stat])>1000))throw new Error("Invalid stat "+stat);
 }
 const recent=[...valid].sort((a,b)=>b.season-a.season||b.week-a.week).slice(0,lookback);
 if(recent.length<minGames)return {ok:false,reason:"INSUFFICIENT_GAMES",games:recent.length,required:minGames};
 // All games contribute; recency receives modest extra weight.
 const weights=recent.map((_,i)=>Math.pow(0.85,i)),denom=weights.reduce((a,b)=>a+b,0);
 const stats={position};
 for(const k of KEYS)stats[k]=recent.reduce((sum,g,i)=>sum+Number(g.stats?.[k]||0)*weights[i],0)/denom;
 const projected_points=scoreProjectedStats(stats,scoring);
 return {ok:true,method:"weighted_recent_games_v1",games:recent.length,projected_points,projected_stats:stats,limitations:["No opponent adjustment","No weather adjustment","No confirmed inactive data","Missing stats treated as zero; supply complete logs"]};
}
