import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function routeFiles(root: string): string[] {
	const output: string[] = [];
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		if (statSync(path).isDirectory()) output.push(...routeFiles(path));
		else if (entry === '+server.ts') output.push(path);
	}
	return output;
}

describe('Council API capability boundary', () => {
	it('guards every exported handler, including every write route', () => {
		const root = join(process.cwd(), 'src', 'routes', 'api', 'council');
		const files = routeFiles(root);
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const source = readFileSync(file, 'utf-8');
			const handlers = source.match(/export const (?:GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
			const guards = source.match(/requireModuleCapability\('council', '[a-z0-9.-]+'\)/g) ?? [];
			expect(guards.length, `${file} must guard every handler`).toBeGreaterThanOrEqual(
				handlers.length
			);
		}
	});
});
