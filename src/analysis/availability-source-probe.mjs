// Diagnostic only. No page text, ESPN injury field, or inactive-list omission
// is accepted as proof that a player is active or inactive.
export const NFL_INACTIVES_URL='https://www.nfl.com/inactives/';
export const ESPN_SCOREBOARD_URL='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const keys=x=>x&&typeof x==='object'&&!Array.isArray(x)?Object.keys(x).sort():[];
async function retrieve(fetcher,url){
 const r=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{accept:'text/html,application/json'}});
 if(!r.ok)throw Error('HTTP '+r.status);
 return r;
}
export async function probeAvailabilitySources({season,week,fetcher=fetch,checked_at=new Date().toISOString()}={}){
 if(!Number.isInteger(season)||season<2020||season>2100||!Number.isInteger(week)||week<1||week>18)throw Error('Invalid NFL season/week');
 const report={checked_at,season,week,read_only:true,availability_usable:false,
  optimizer_permission:'BLOCK',sources:{},missing_evidence:['VERIFIED_GAME_SPECIFIC_PLAYER_DECISIONS','OFFICIAL_PUBLICATION_TIMESTAMPS','TRUSTED_PLAYER_ID_CROSSWALK']};
 const url=ESPN_SCOREBOARD_URL+'?dates='+season+'&seasontype=2&week='+week;
 const [nfl,espn]=await Promise.allSettled([retrieve(fetcher,NFL_INACTIVES_URL),retrieve(fetcher,url)]);
 if(nfl.status==='fulfilled'){
  const body=await nfl.value.text();
  report.sources.nfl={url:NFL_INACTIVES_URL,reachable:true,http_status:nfl.value.status,content_type:nfl.value.headers.get('content-type'),bytes:body.length,
   html_observations:{contains_inactive_word:/\\binactives?\\b/i.test(body),contains_placeholder:/coming soon|no inactives|check back/i.test(body)},
   structured_game_decisions_verified:false,publication_time_verified:false};
 }else report.sources.nfl={url:NFL_INACTIVES_URL,reachable:false,error:String(nfl.reason?.message||nfl.reason)};
 if(espn.status==='fulfilled'){
  try{
   const body=await espn.value.json(),events=Array.isArray(body.events)?body.events:[];
   const matches=Number(body.season?.year)===season&&Number(body.season?.type)===2&&Number(body.week?.number)===week;
   report.sources.espn={url,reachable:true,http_status:espn.value.status,season_week_matches:matches,
    top_level_fields:keys(body),event_count:events.length,
    observed_event_fields:keys(events[0]),observed_competition_fields:keys(events[0]?.competitions?.[0]),
    observed_status_fields:keys(events[0]?.status),
    has_game_ids:matches&&events.length>0&&events.every(e=>typeof e.id==='string'&&e.id.length>0),
    has_kickoffs:matches&&events.length>0&&events.every(e=>Number.isFinite(Date.parse(e.date||e.competitions?.[0]?.date))),
    explicit_official_player_availability_verified:false};
  }catch(e){report.sources.espn={url,reachable:true,parse_error:String(e.message)};}
 }else report.sources.espn={url,reachable:false,error:String(espn.reason?.message||espn.reason)};
 return report;
}
