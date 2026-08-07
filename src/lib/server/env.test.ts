import { afterEach, describe, expect, it } from 'vitest';
import { getAionLumenPath, getRegelwerkPath, getFolioDbPath, getHomePlz } from './env.js';

describe('env path getters', () => {
	afterEach(() => {
		delete process.env.FOLIO_HOME_PLZ;
		delete process.env.FOLIO_HOME_LAT;
		delete process.env.FOLIO_HOME_LNG;
		delete process.env.FOLIO_HOME_CITY;
	});

	it('getAionLumenPath returns a multi-agent path', () => {
		expect(getAionLumenPath()).toContain('multi-agent');
	});

	it('getRegelwerkPath points at regelwerk.yaml under config', () => {
		expect(getRegelwerkPath()).toMatch(/config\/regelwerk\.yaml$/);
	});

	it('getFolioDbPath defaults outside project tree', () => {
		expect(getFolioDbPath()).toContain('.folio');
	});

	it('reads demo home coordinates exported by the launcher process', () => {
		process.env.FOLIO_HOME_PLZ = '8000';
		process.env.FOLIO_HOME_LAT = '37.0194';
		process.env.FOLIO_HOME_LNG = '-7.9322';
		process.env.FOLIO_HOME_CITY = 'Faro';
		expect(getHomePlz()).toEqual({
			plz: '8000',
			lat: 37.0194,
			lng: -7.9322,
			city: 'Faro'
		});
	});
});
