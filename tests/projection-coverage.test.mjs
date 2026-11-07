import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeProjectionCoverage} from '../src/analysis/projection-coverage.mjs';
test('projection evidence lists exact missing stat and observed weeks without inventing gaps',()=>{
 const a={through_week:6,players:[{player_id:'a',name:'A',position:'WR',projection:{ok:false,reason:'MISSING_REQUIRED_STATS',stat:'rec',week:4}},{player_id:'b',name:'B',position:'RB',projection:{ok:true,projected_points:10}}]};
 const cache={season:2026,identities:{a:'00-1234567'},players:{a:[{season:2026,week:2,played:true},{season:2026,week:4,played:true},{season:2026,week:7,played:true}],b:[{season:2026,week:5,played:true}]}};
 const r=summarizeProjectionCoverage(a,cache);
 assert.equal(r.projected,1);assert.equal(r.missing,1);assert.equal(r.verified_for_optimizer,false);
 assert.deepEqual(r.missing_players[0].observed_weeks,['2026-W2','2026-W4']);assert.equal(r.missing_players[0].stat,'rec');assert.equal(r.missing_players[0].week,4);
});
test('missing logs remain missing, not zero-point projections',()=>{
 const r=summarizeProjectionCoverage({through_week:6,players:[{player_id:'x',name:'X',position:'TE',projection:{ok:false,reason:'NO_VERIFIED_GAME_LOGS'}}]},{players:{},identities:{}});
 assert.equal(r.missing,1);assert.equal(r.missing_players[0].observed_games,0);assert.equal(r.missing_players[0].historical_identity_found,false);
});
