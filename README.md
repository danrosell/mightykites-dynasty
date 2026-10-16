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
