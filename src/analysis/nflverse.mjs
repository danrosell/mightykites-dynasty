// nflverse player_stats CSV ingestion. No name-only joins: IDs must be matched
// by a separately verified mapping before projections are assigned to Sleeper players.
const STAT_FIELDS=["completions","attempts","passing_yards","passing_tds","interceptions","carries","rushing_yards","rushing_tds","receptions","receiving_yards","receiving_tds","sack_yards_suffered"];
export function parseCSV(text){
 const rows=[];let row=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
  else if(c===","&&!quoted){row.push(field);field=""}
  else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(field);field="";if(row.some(x=>x!==""))rows.push(row);row=[]}
  else field+=c;
 }
 if(quoted)throw Error("Unterminated CSV quote");
 row.push(field);if(row.some(x=>x!==""))rows.push(row);
 const headers=rows.shift();if(!headers?.length)throw Error("Missing CSV header");
 return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
}
const num=(row,k)=>{const s=row[k];if(s===undefined||s==="")return 0;const n=Number(s);if(!Number.isFinite(n))throw Error("Invalid "+k);return n};
export function convertNflverseRows(rows,{season,playerId}={}){
 if(!Number.isInteger(season)||!playerId)throw Error("Season and verified nflverse player ID required");
 const selected=rows.filter(r=>String(r.player_id)===String(playerId)&&Number(r.season)===season&&String(r.season_type)==="REG");
 if(!selected.length)return [];
 const weeks=new Set();
 return selected.map(r=>{
  const week=Number(r.week);
  if(!Number.isInteger(week)||week<1||week>18||weeks.has(week))throw Error("Duplicate or invalid week");
  weeks.add(week);
  const stats={
   pass_yd:num(r,"passing_yards"),pass_td:num(r,"passing_tds"),pass_int:num(r,"interceptions"),
   rush_yd:num(r,"rushing_yards"),rush_td:num(r,"rushing_tds"),rush_att:num(r,"carries"),
   rec:num(r,"receptions"),rec_yd:num(r,"receiving_yards"),rec_td:num(r,"receiving_tds")
  };
  return {season,week,played:true,stats};
 });
}
export function requireVerifiedIdentity(mapping,sleeperId){
 const m=mapping?.[sleeperId];
 if(!m?.nflverse_id||m.verified!==true||!m.source)throw Error("Unverified Sleeper-to-nflverse player identity");
 return m.nflverse_id;
}
