import { getFolioDbPath } from '../../env.js';
import type { ModuleRegistration } from '../types.js';

export const CAREER_MODULE: ModuleRegistration = {
	manifest: {
		schema: 'folio/module-manifest/v1',
		id: 'career',
		label: 'Karriere',
		version: '1',
		capabilities: [
			{ id: 'cases.read', kind: 'read', description: 'Read local career cases and fit assessments.' },
			{ id: 'cases.write', kind: 'write', description: 'Create local career cases.' },
			{ id: 'assessments.write', kind: 'write', description: 'Append evidence-bound fit assessments.' }
		],
		data_classes: [
			{ id: 'position', sensitivity: 'private', retention: { policy: 'owner-managed', enforced: false } },
			{ id: 'fit-assessment', sensitivity: 'sensitive', retention: { policy: 'append-only-audit', enforced: true } }
		],
		panels: [],
		databases: [
			{ id: 'folio-state', engine: 'sqlite', access: 'read-write', data_classes: ['position', 'fit-assessment'] }
		],
		kill_switch: { global_env: 'FOLIO_MODULES_DISABLED', module_env: 'FOLIO_DISABLED_MODULES' }
	},
	enabled: () => true,
	database_paths: { 'folio-state': getFolioDbPath }
};
