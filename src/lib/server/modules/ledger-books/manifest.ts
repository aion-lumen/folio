import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModuleRegistration } from '../types.js';

export const LEDGER_BOOKS_MODULE: ModuleRegistration = {
	manifest: {
		schema: 'folio/module-manifest/v1',
		id: 'ledger-books',
		label: 'Ledger Books',
		version: '0',
		capabilities: [
			{ id: 'panel.render', kind: 'render', description: 'Render the private Books review workspace.' },
			{ id: 'batches.read', kind: 'read', description: 'Read one local, unbooked statement review batch.' },
			{ id: 'contracts.reconcile', kind: 'write', description: 'Record source-bound subscription mail events in Folio; no provider actions or bank writes.' },
			{ id: 'intake.read', kind: 'read', description: 'Read Ledger\'s private finance observation review receipt.' },
			{ id: 'observations.read', kind: 'read', description: 'Read the local Folio-to-Ledger observation exchange.' },
			{ id: 'observations.write', kind: 'write', description: 'Stage confirmed finance memory as evidenced observations.' },
			{ id: 'statements.preview', kind: 'write', description: 'Security-check an explicitly selected local statement and stage a Ledger preview; never book.' }
		],
		data_classes: [
			{
				id: 'source-coverage',
				sensitivity: 'private',
				retention: { policy: 'local-user-controlled', enforced: false }
			},
			{
				id: 'book-entry',
				sensitivity: 'sensitive',
				retention: { policy: 'local-user-controlled', enforced: false }
			},
			{
				id: 'finance-observation',
				sensitivity: 'sensitive',
				retention: { policy: 'local-user-controlled', enforced: false }
			},
			{
				id: 'finance-observation-review',
				sensitivity: 'sensitive',
				retention: { policy: 'local-user-controlled', enforced: false }
			}
		],
		panels: [
			{
				id: 'import-review',
				label: 'Statement import review',
				requires: 'panel.render',
				fields: [
					{ id: 'coverage.summary', label: 'Source coverage', data_class: 'source-coverage' },
					{ id: 'entry.statement', label: 'Unbooked statement entry', data_class: 'book-entry' }
				]
			}
		],
		databases: [
			{
				id: 'staging',
				engine: 'filesystem',
				access: 'read-only',
				data_classes: ['source-coverage', 'book-entry']
			},
			{
				id: 'observation-exchange',
				engine: 'filesystem',
				access: 'read-write',
				data_classes: ['finance-observation']
			},
			{
				id: 'observation-intake',
				engine: 'filesystem',
				access: 'read-only',
				data_classes: ['finance-observation', 'finance-observation-review']
			}
		],
		kill_switch: {
			global_env: 'FOLIO_MODULES_DISABLED',
			module_env: 'FOLIO_DISABLED_MODULES'
		}
	},
	enabled: () => true,
	database_paths: {
		staging: () =>
			process.env.LEDGER_BOOKS_STAGING_PATH?.trim() ||
			join(homedir(), '.ledger', 'books', 'staging', 'dkb-review.json'),
		'observation-exchange': () =>
			process.env.LEDGER_FINANCE_OBSERVATIONS_PATH?.trim() ||
			join(homedir(), '.folio', 'session-exchange', 'ledger', 'inbox', 'finance-observations.json'),
		'observation-intake': () =>
			process.env.LEDGER_FINANCE_INTAKE_PATH?.trim() ||
			join(homedir(), '.ledger', 'books', 'staging', 'finance-observation-intake.json')
	}
};
