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
