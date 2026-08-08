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

describe('Sonar capability boundary', () => {
	it('guards the page and every Sonar API handler', () => {
		const page = readFileSync(join(process.cwd(), 'src/routes/sonar/+page.server.ts'), 'utf8');
		for (const capability of ['panel.render', 'notes.read', 'reviews.read', 'archive.read']) {
			expect(page).toContain(`requireModuleCapability('sonar', '${capability}')`);
		}

		const files = routeFiles(join(process.cwd(), 'src/routes/api/sonar'));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const source = readFileSync(file, 'utf8');
			const handlers = source.match(/export const (?:GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
			const guards = source.match(/requireModuleCapability\('sonar', '[a-z0-9.-]+'\)/g) ?? [];
			expect(guards.length, `${file} must guard every handler`).toBeGreaterThanOrEqual(handlers.length);
		}
	});
});
