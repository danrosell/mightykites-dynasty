import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeIdentityCoverage} from '../src/analysis/identity-coverage.mjs';
const snapshot={my_team:{starters:[{player_id:'a',name:'A',position:'RB'}],bench:[{player_id:'b',name:'B',position:'TE'},{player_id:'c',name:'C',position:'WR'}]}};
test('historical GSIS IDs remain unverified for current roster and game day',()=>{
 const r=summarizeIdentityCoverage(snapshot,{players:{a:{verified:true,gsis_id:'00-1234567'}}},{identities:{a:'00-1234567',b:'00-7654321'}});
 assert.equal(r.total,3);assert.equal(r.current_verified,1);assert.equal(r.historical_only,1);assert.equal(r.unresolved,1);
 assert.equal(r.all_current_verified,false);assert.equal(r.players[1].reason,'HISTORICAL_ONLY');
 assert.ok(r.players.every(p=>p.game_day_availability==='UNKNOWN'));
});
test('current-vs-historical GSIS conflicts are reported, never promoted',()=>{
 const r=summarizeIdentityCoverage(snapshot,{players:{a:{verified:true,gsis_id:'00-1234567'}}},{identities:{a:'00-7654321'}});
 assert.equal(r.current_verified,0);assert.equal(r.unresolved,2);assert.equal(r.players[0].identity_conflict,true);
 assert.equal(r.players[0].reason,'HISTORICAL_CURRENT_ID_CONFLICT');
});
test('malformed historical IDs cannot certify a player',()=>{
 const r=summarizeIdentityCoverage(snapshot,{players:{}},{identities:{b:'fake'}});
 assert.equal(r.historical_only,0);assert.equal(r.players[1].reason,'NO_INDEPENDENT_IDENTITY');
});
