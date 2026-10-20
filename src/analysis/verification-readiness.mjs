// Evidence checklist is informational and cannot authorize the lineup optimizer.
export function summarizeVerificationReadiness(analysis){
 const v=analysis?.verification,coverage=analysis?.identity_coverage,lineup=analysis?.lineup;
 const total=Number(coverage?.total)||0,verified=Number(coverage?.current_verified)||0;
 const checks=[
  {id:'current_identity',label:'Current independent player identities',ok:total>0&&verified===total,detail:total?verified+'/'+total+' players verified':'No coverage report'},
  {id:'schedule',label:'Independent weekly schedule',ok:v?.ok===true,detail:v?.ok===true?'Cross-checked':'Verification incomplete'},
  {id:'official_availability',label:'Official game-day player availability',ok:false,detail:'No verified per-player NFL active/inactive evidence connected'},
  {id:'projections',label:'Complete eligible-player projections',ok:lineup?.ok===true,detail:lineup?.ok===true?'Optimizer verified':'Not established for all eligible players'}
 ];
 return {ready:false,optimizer_permission:'BLOCK',checks};
}
