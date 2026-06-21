import { describe, expect, it } from 'vitest';
import { getAionLumenPath, getRegelwerkPath, getFolioDbPath } from './env.js';

describe('env path getters', () => {
	it('getAionLumenPath returns a multi-agent path', () => {
		expect(getAionLumenPath()).toContain('multi-agent');
	});

	it('getRegelwerkPath points at regelwerk.yaml under config', () => {
		expect(getRegelwerkPath()).toMatch(/config\/regelwerk\.yaml$/);
	});

	it('getFolioDbPath defaults outside project tree', () => {
		expect(getFolioDbPath()).toContain('.folio');
	});
});
