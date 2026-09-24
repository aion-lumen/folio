import { expect, it } from 'vitest';
import { unregisteredMailAccounts } from './mail-account.js';

it('warns about imported accounts absent from the registry without inventing fresh accounts', () => {
 expect(unregisteredMailAccounts({ old: 12, personal: 3, empty: 0 }, ['personal'])).toEqual(['old']);
 expect(unregisteredMailAccounts({}, [])).toEqual([]);
 expect(unregisteredMailAccounts({ personal: 3 }, ['personal'])).toEqual([]);
});
it('normalizes historical scopes and legacy aliases before comparing accounts', () => {
 expect(unregisteredMailAccounts({ 'konto-a-history': 5, konto_a: 2, 'old-history': 4, old: 1 }, ['konto-a'])).toEqual(['old']);
 expect(unregisteredMailAccounts({ unassigned: 1 }, [])).toEqual(['unassigned']);
});
