import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Session Relay route guards', () => {
	it('guards the panel and every mutation capability at the HTTP boundary', () => {
		const source = readFileSync(join(process.cwd(), 'src/routes/relay/+page.server.ts'), 'utf8');
		for (const capability of [
			'panel.render',
			'cases.read',
			'egress.approve',
			'cases.share',
			'responses.read',
			'responses.apply'
		]) {
			expect(source).toContain(`requireModuleCapability('relay', '${capability}')`);
		}
	});

	it('guards mail staging at the HTTP boundary', () => {
		const source = readFileSync(join(process.cwd(), 'src/routes/api/relay/mail/+server.ts'), 'utf8');
		expect(source).toContain(`requireModuleCapability('relay', 'cases.read')`);
		expect(source).toContain(`requireModuleCapability('relay', 'cases.stage')`);
	});
});
