# Public FFFS MCP endpoint

This standalone Vercel project uses Node.js 24 and has no npm dependencies.
From the repository root, run `node scripts/build-vercel.mjs` after changing
`lib/`. Commit the generated `server/worker.mjs` with its sources.

Set the Vercel project Root Directory to `server`. `npm ci` checks the minimal
lockfile; no build command is needed. Routes are `/mcp` and `/health`.

`DATA_BASE_URL` defaults to `https://nic-esp.github.io/fffs-bibliotek/`.
`ALLOWED_ORIGINS` defaults to `*` for public read-only browser access; no
credentialed CORS is enabled. An explicit comma-separated list restricts origins.
The shared loader still restricts upstream data to a configured HTTPS GitHub
Pages origin and bounded paths. User input cannot supply upstream URLs.

Local bundle/adapter verification: `npx tsx --test tests/vercel-adapter.test.ts`
from the repository root. After deployment: `npx tsx scripts/smoke-mcp.ts
https://YOUR-HOST/mcp`. Deployment protection must permit anonymous access.
