import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeLegalSlots,planVerifiedLineup} from '../src/analysis/lineup.mjs';
const p=(player_id,position,projected_points)=>({player_id,position,projected_points});
test('exact assignment avoids greedy FLEX mistake and supports SUPER_FLEX',()=>{
 const r=optimizeLegalSlots(['FLEX','RB','SUPER_FLEX'],[p('rb','RB',30),p('wr','WR',20),p('qb','QB',40)]);
 assert.equal(r.ok,true);assert.equal(r.remaining_projected_points,90);
 assert.deepEqual(r.slots.map(x=>x.player_id),['wr','rb','qb']);
});
test('complete lineups use distinct players and support negative projections',()=>{
 const r=optimizeLegalSlots(['WR','FLEX'],[p('w','WR',10),p('r','RB',-2)]);
 assert.equal(r.ok,true);assert.equal(r.remaining_projected_points,8);assert.equal(new Set(r.slots.map(x=>x.player_id)).size,2);
 assert.equal(optimizeLegalSlots(['WR','WR'],[p('w','WR',10)]).reason,'NO_COMPLETE_LEGAL_LINEUP');
});
test('started starters stay in their exact slots and do not contribute invented points',()=>{
 const r=optimizeLegalSlots(['WR','FLEX'],[p('better','WR',100),p('bench','RB',20)],{locked:[{...p('locked','WR',1),slot_index:0}]});
 assert.equal(r.slots[0].player_id,'locked');assert.equal(r.slots[0].projected_points,null);assert.equal(r.remaining_projected_points,100);
});
test('unknown slots, invalid locks, duplicate identities and invalid scores are rejected',()=>{
 for(const f of [()=>optimizeLegalSlots(['QB_FLEX'],[]),()=>optimizeLegalSlots(['WR'],[p('w','WR',NaN)]),()=>optimizeLegalSlots(['WR'],[p('w','WR',1),p('w','WR',2)]),()=>optimizeLegalSlots(['WR'],[],{locked:[{...p('q','QB',1),slot_index:0}]})])assert.throws(f);
});
test('exact solver matches exhaustive assignments across deterministic small rosters',()=>{
 const allowed={QB:['QB'],RB:['RB'],WR:['WR'],FLEX:['RB','WR','TE'],SUPER_FLEX:['QB','RB','WR','TE']};
 function oracle(slots,ps,i=0,used=new Set()){if(i===slots.length)return 0;let best=-Infinity;for(const x of ps)if(!used.has(x.player_id)&&allowed[slots[i]].includes(x.position)){used.add(x.player_id);best=Math.max(best,x.projected_points+oracle(slots,ps,i+1,used));used.delete(x.player_id);}return best;}
 for(let n=0;n<40;n++){
  const ps=Array.from({length:6},(_,i)=>p(String(i),['QB','RB','WR','TE'][(i+n)%4],((i*17+n*11)%33)-7));
  const slots=[['QB','FLEX','SUPER_FLEX'],['RB','WR','FLEX'],['WR','WR','SUPER_FLEX']][n%3];
  const expected=oracle(slots,ps),actual=optimizeLegalSlots(slots,ps);
  assert.equal(actual.ok,Number.isFinite(expected));if(actual.ok)assert.equal(actual.remaining_projected_points,expected);
 }
});
const now=Date.parse('2026-10-16T14:00:00Z');
function context(){
 const players=[{player_id:'q',name:'QB',position:'QB',projection:{ok:true,projected_points:20}},{player_id:'w',name:'WR',position:'WR',projection:{ok:true,projected_points:10}},{player_id:'r',name:'RB',position:'RB',projection:{ok:true,projected_points:15}}];
 const snapshot={league:{roster_positions:['QB','FLEX','BN'],settings:{}},my_team:{starters:players.slice(0,2),bench:players.slice(2)}};
 const verification={ok:true,season:2026,week:6,players:Object.fromEntries(players.map(p=>[p.player_id,{has_game:true,started:false,status:'ACT',game:{game_id:'event'}}]))};
 const availability={season:2026,week:6,source:'independent confirmed fixture',generated_at:new Date(now).toISOString(),players:Object.fromEntries(players.map(p=>[p.player_id,{status:'active',confirmed:true,game_id:'event'}]))};
 return {players,snapshot,verification,availability};
}
test('verified complete inputs can produce a legal lineup',()=>{
 const c=context(),r=planVerifiedLineup(c.snapshot,c.players,c.verification,{now,availability:c.availability});
 assert.equal(r.ok,true);assert.equal(r.remaining_projected_points,35);assert.deepEqual(r.slots.map(p=>p.player_id),['q','r']);
});
test('roster ACT never becomes assumed game-day availability',()=>{
 const c=context(),r=planVerifiedLineup(c.snapshot,c.players,c.verification,{now});assert.equal(r.ok,false);assert.ok(r.issues.every(i=>i.code==='AVAILABILITY_NOT_VERIFIED'));assert.equal(r.slots,undefined);
});
test('missing projection on an unselected bench player blocks recommendations',()=>{
 const c=context();c.players[1].projection={ok:false};const r=planVerifiedLineup(c.snapshot,c.players,c.verification,{now,availability:c.availability});assert.equal(r.ok,false);assert.ok(r.issues.some(i=>i.code==='MISSING_PLAYER_PROJECTION'));
});
test('stale/wrong-event availability, missing candidates and special rules fail closed',()=>{
 for(const mutation of [c=>c.availability.generated_at='2000-01-01',c=>c.availability.players.q.game_id='other',c=>c.players.pop(),c=>c.snapshot.league.settings.max_subs=1,c=>c.verification.ok=false]){
  const c=context();mutation(c);assert.equal(planVerifiedLineup(c.snapshot,c.players,c.verification,{now,availability:c.availability}).ok,false);
 }
});
test('started bench players cannot enter and locked starters cannot move',()=>{
 const c=context();c.verification.players.q.started=true;c.verification.players.r.started=true;
 const r=planVerifiedLineup(c.snapshot,c.players,c.verification,{now,availability:c.availability});assert.equal(r.ok,true);assert.equal(r.slots[0].player_id,'q');assert.equal(r.slots[0].locked,true);assert.equal(r.slots[1].player_id,'w');assert.equal(r.remaining_projected_points,10);
});
test('verified byes and confirmed inactive players are excluded without zero projections',()=>{
 const c=context();c.verification.players.r.has_game=false;c.players[2].projection={ok:false};
 let r=planVerifiedLineup(c.snapshot,c.players,c.verification,{now,availability:c.availability});assert.equal(r.ok,true);assert.equal(r.remaining_projected_points,30);
 c.verification.players.r.has_game=true;c.availability.players.r.status='inactive';
 r=planVerifiedLineup(c.snapshot,c.players,c.verification,{now,availability:c.availability});assert.equal(r.ok,true);assert.equal(r.remaining_projected_points,30);
});

test('actual QB Controversy slot topology reaches a feasible global upper bound',()=>{
 const slots=['QB','RB','RB','WR','WR','WR','TE','FLEX','FLEX','SUPER_FLEX'];
 const positions=['QB','QB','RB','RB','RB','WR','WR','WR','TE','TE','RB','WR','TE'];
 const players=positions.map((pos,i)=>p(String(i),pos,100-i));
 const r=optimizeLegalSlots(slots,players);assert.equal(r.ok,true);assert.equal(r.remaining_projected_points,955);assert.equal(new Set(r.slots.map(p=>p.player_id)).size,10);
});
test('NFL reserve status cannot silently exclude a potentially elevated player',()=>{
 const c=context();c.verification.players.r.status='RES';
 assert.equal(planVerifiedLineup(c.snapshot,c.players,c.verification,{now}).ok,false);
 assert.equal(planVerifiedLineup(c.snapshot,c.players,c.verification,{now,availability:c.availability}).ok,false);
 c.availability.players.r.status='inactive';assert.equal(planVerifiedLineup(c.snapshot,c.players,c.verification,{now,availability:c.availability}).ok,true);
});
test('completed lineups still do not produce advice without an availability provider',()=>{
 const c=context();for(const v of Object.values(c.verification.players))v.started=true;
 assert.equal(planVerifiedLineup(c.snapshot,c.players,c.verification,{now}).ok,false);
});
