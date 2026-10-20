import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeVerificationReadiness} from '../src/analysis/verification-readiness.mjs';
test('even verified identities and schedule never imply official game-day availability',()=>{
 const r=summarizeVerificationReadiness({verification:{ok:true},identity_coverage:{total:24,current_verified:24},lineup:{ok:false}});
 assert.equal(r.optimizer_permission,'BLOCK');assert.equal(r.ready,false);
 assert.equal(r.checks.find(x=>x.id==='current_identity').ok,true);
 assert.equal(r.checks.find(x=>x.id==='official_availability').ok,false);
});
test('missing identity report and conflicting verification remain pending',()=>{
 const r=summarizeVerificationReadiness({verification:{ok:false},identity_coverage:{total:24,current_verified:22}});
 assert.equal(r.checks.find(x=>x.id==='current_identity').ok,false);
 assert.equal(r.checks.find(x=>x.id==='schedule').ok,false);
 assert.equal(r.checks.find(x=>x.id==='projections').ok,false);
});
