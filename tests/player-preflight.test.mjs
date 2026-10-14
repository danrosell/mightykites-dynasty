import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSchedule} from "../netlify/functions/player-preflight.mjs";
test("only requested week included",()=>assert.equal(normalizeSchedule([{week:6,home:"DEN",away:"KC",kickoff:"2026-10-18T20:00:00Z"},{week:7,home:"DEN",away:"KC",kickoff:"2026-10-25T20:00:00Z"}],6).length,1));
test("reject invalid teams",()=>assert.throws(()=>normalizeSchedule([{week:6,home:"XXX",away:"KC",kickoff:"2026-10-18T20:00:00Z"}],6)));
test("reject missing schedule",()=>assert.throws(()=>normalizeSchedule([],6)));
