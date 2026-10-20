import {probeAvailabilitySources} from '../src/analysis/availability-source-probe.mjs';
const result = await probeAvailabilitySources({season:2026,week:7});
console.log(JSON.stringify(result,null,2));
if(result.optimizer_permission !== 'BLOCK') process.exitCode = 1;
