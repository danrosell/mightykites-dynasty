import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOfficialAvailability} from '../src/analysis/official-availability.mjs';
const metadata={season:2026,week:7,generated_at:'2026-10-20T16:00:00Z',source_url:'https://www.nfl.com/games/example'};
const decision={player_id:'4663',game_id:'game-1',status:'inactive',explicit:true,reported_at:'2026-10-20T15:59:00Z'};
test('explicit official decisions retain game, timestamp and source provenance',()=>{
 const result=normalizeOfficialAvailability([decision],metadata);
 assert.equal(result.players['4663'].evidence_type,'EXPLICIT_INACTIVE');
 assert.equal(result.players['4663'].game_id,'game-1');
 assert.equal(result.source,'NFL_OFFICIAL_GAME_DAY_STATUS');
});
test('omission, roster membership and ambiguous decisions never imply active',()=>{
 assert.deepEqual(normalizeOfficialAvailability([],metadata).players,{});
 for(const d of [{...decision,explicit:false},{...decision,status:'questionable'},{...decision,reported_at:null},{...decision,game_id:''}])assert.throws(()=>normalizeOfficialAvailability([d],metadata));
 assert.throws(()=>normalizeOfficialAvailability([decision,decision],metadata));
 assert.throws(()=>normalizeOfficialAvailability([decision],{...metadata,source_url:'https://example.com'}));
});
