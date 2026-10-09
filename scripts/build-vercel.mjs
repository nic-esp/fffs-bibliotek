import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Commit this bundle: the isolated server package has no install-time dependencies.
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['lib/worker.ts'],
  outfile: 'server/worker.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  minify: true,
  legalComments: 'eof',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
