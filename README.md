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
