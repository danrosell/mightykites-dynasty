# MightyKites Dynasty HQ

Static dynasty dashboard + Netlify Function bridge to Sleeper.

## Deploy
1. Upload all files/folders in this project to a GitHub repository.
2. In Netlify, connect/import that repository.
3. Build command: leave blank.
4. Publish directory: `.`
5. Functions directory is configured in `netlify.toml`.
6. Deploy.

The four public machine-readable endpoints will be:
- `/api/league/imperial`
- `/api/league/qb-controversy`
- `/api/league/jersey`
- `/api/league/tri-state`

No API keys or environment variables are required.

## QB Controversy projection validation

`/api/optimizer/qb-controversy` returns historical baselines, never lineup advice.
It uses at most five observed games before the current NFL week (at least three),
with weights 1, 0.85, 0.85², … and the live league scoring settings. Current-week
results are excluded for all players. Missing required statistics or identity
mappings produce an unavailable result; invalid/stale caches fail with HTTP 503.
The cache records explicit Sleeper-to-GSIS identities and includes two-point
conversions, lost fumbles, special teams touchdowns and fumble recovery touchdowns.
These baselines have no opponent, availability, injury or weather adjustment.

Run `node --test tests/*.test.mjs` and
`PYTHONPATH=scripts python3 -m unittest discover -s tests -p 'test_*.py'`.
Run `python3 scripts/refresh-nflverse.py` to refresh the verified 2026 cache.
Then run `node scripts/validate-qb-live.mjs` to invoke both real functions locally
against live Sleeper and compare every roster log/stat and resulting projection
against the nflverse CSV using explicit IDs. CI performs this audit after refresh
without publishing its temporary cache. Network/schema/identity failures fail the audit.

To verify a Netlify preview or production deployment, run
`node scripts/validate-qb-live.mjs --origin https://DEPLOYMENT_HOST`.
This verifies actual routing, the published cache and function response as well
as upstream roster identity and independent scoring calculations. A protected
preview returning 401 is a failed deployment validation, not permission to merge.

## Cloudflare Workers Free migration

This repository also deploys to Cloudflare Workers **Free** with static assets.
Use the free `workers.dev` address. No paid bindings, databases, storage products,
AI APIs, custom domains or paid-plan upgrades are needed. Free limits apply;
validate the deployed Worker on the Free plan before replacing Netlify.

Install using `pnpm install --frozen-lockfile`. Run `pnpm build` to generate `dist/`
from the dashboard, verified cache, snapshots, and a compact lookup of current
Sleeper roster player identities. Repository files and secrets are not published.
Run `pnpm exec wrangler deploy --dry-run` to check the bundle, and `pnpm dev`
for the actual local Cloudflare runtime. Run the source audit against its URL:
`node scripts/validate-qb-live.mjs --origin http://127.0.0.1:8787`.

Cloudflare dashboard setup: Workers & Pages → Create application → Connect GitHub
→ select this repository. Build command: `pnpm run build`. Deploy command:
`pnpm exec wrangler deploy`. Select the intended branch under build settings;
keep previews off until explicitly needed to conserve free build minutes.
Do not select Workers Paid or add payment details for this migration.

The `/api/league/*` routes still read live rosters, scoring and matchups from
Sleeper. The compact player lookup is rebuilt at deployment and expires after
26 hours. New roster IDs absent from that lookup fail closed until rebuilt.
The existing hourly snapshot workflow now fetches directly from Sleeper, so it
continues after Netlify is retired; connect the production branch to Cloudflare
builds to refresh metadata following those commits. Historical logs continue
refreshing through the existing daily verified nflverse workflow. All four
league feeds and QB Controversy's optimizer route are preserved. The optimizer
uses internal calls and the assets binding, without HTTP requests back to its
own public hostname. Lineup advice remains blocked.

After deployment, run the live audit against the returned `workers.dev` URL,
check all four league feeds and the dashboard, and verify Free-plan CPU usage.
Only then change links away from Netlify. Netlify remains available for rollback.

## Independent verification and legal-slot engine

Cloudflare's QB Controversy response includes `verification`: current-week
Sleeper IDs and GSIS IDs are joined to nflverse roster records, and all weekly
ESPN games/kickoffs are cross-checked against nflverse's independent schedule.
No player-name joins are used. Wrong season/week, conflicting IDs, duplicate
teams, incomplete games, stale roster data (2 hours) or live schedules (15 minutes)
block verification. Roster status is reported separately from game-day availability.
Builds generate the compact verification asset from public feeds using existing
free hosting; the normal hourly refresh keeps it current.

`src/analysis/lineup.mjs` supplies an exact slot-assignment solver for QB/RB/WR/TE,
FLEX, SUPER_FLEX, REC_FLEX and WRRB_FLEX (maximum 12 active slots). It prohibits
duplicate players, freezes started starters in their original slots, excludes
started bench players, respects verified byes and confirmed inactives, and reports
only remaining projected points, without inventing scores for locked players.
Unsupported slot/substitution rules and incomplete candidate projections block
advice rather than silently restricting the comparison to players with data.

**Production advice remains blocked.** There is no connected official game-day
availability provider. NFL roster ACT is never converted into confirmed active
status. A complete verified game-day availability payload and complete eligible
player projections are required before any lineup can be returned. Synthetic
tests exercise the ready path; the public endpoint accepts no enable/bypass flag.

After building and starting the local Cloudflare runtime, run
`node scripts/validate-qb-verification-live.mjs --origin http://127.0.0.1:8787`.
The audit independently checks every roster identity and schedule against fresh
source CSVs, checks started-player locks and confirms advice stays blocked.
CI runs this alongside the independent projection-score audit. Use the same
command with the deployed URL before merging or releasing this change.
