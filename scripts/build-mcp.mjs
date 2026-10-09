import { build } from 'esbuild';
await build({entryPoints:['lib/worker.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',conditions:['workerd','worker','browser'],outfile:'dist/server/index.js',minify:true,external:['node:async_hooks']});
