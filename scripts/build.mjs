import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyBuild } from './verify-build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.env.FOLIO_BUILD_VERSION || randomUUID();
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), 'build', ...process.argv.slice(2)], {
 cwd: root, stdio: 'inherit', env: { ...process.env, FOLIO_BUILD_VERSION: version }
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
verifyBuild(new URL('../build/', import.meta.url), version);
console.log(`Verified matching server/client bootstrap for build ${version}`);
