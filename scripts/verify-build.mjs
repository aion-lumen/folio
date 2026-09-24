import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reject an SSR page whose bootstrap cannot be consumed by its client bundle.
 * @param {string | URL} directory
 * @param {string} [expectedVersion]
 */
export function verifyBuild(directory, expectedVersion) {
 const root = directory instanceof URL ? fileURLToPath(directory) : directory;
 const version = JSON.parse(readFileSync(join(root, 'client/_app/version.json'), 'utf8')).version;
 if (!version || version === 'development' || (expectedVersion && version !== expectedVersion)) throw Error('Build version missing or changed between build phases');
 /** @param {string} path @param {RegExp} pattern */
 const collect = (path, pattern) => {
  const values = new Set();
  /** @param {string} folder */
  const walk = (folder) => {
   for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
     for (const match of readFileSync(file, 'utf8').matchAll(pattern)) values.add(match[1]);
    }
   }
  };
  walk(path);return values;
 };
 const server = collect(join(root, 'server'), /\bversion_hash\s*:\s*["'`]([a-z0-9]+)["'`]/g);
 const client = collect(join(root, 'client/_app/immutable'), /\bglobalThis\.__sveltekit_([a-z0-9]+)\b/g);
 if (server.size !== 1 || client.size !== 1 || [...server][0] !== [...client][0]) throw Error('Server/client bootstrap mismatch: refuse this build');
 return { version, bootstrap: [...server][0] };
}
