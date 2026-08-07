import {
	getCouncilDbPath,
	getFolioDbPath,
	isCouncilRegistered
} from '../../env.js';
import type { ModuleRegistration } from '../types.js';

export const COUNCIL_MODULE: ModuleRegistration = {
	manifest: {
		schema: 'folio/module-manifest/v1',
		id: 'council',
		label: 'Council',
		version: '1',
		capabilities: [
			{ id: 'panel.render', kind: 'render', description: 'Render Council workspaces.' },
			{ id: 'records.read', kind: 'read', description: 'Read Council objects and evaluations.' },
			{ id: 'records.write', kind: 'write', description: 'Record human Council decisions.' },
			{ id: 'ingest.write', kind: 'write', description: 'Queue a Council source for ingest.' },
			{ id: 'worker.run', kind: 'execute', description: 'Start or inspect the Council lens worker.' }
		],
		data_classes: [
			{ id: 'property', sensitivity: 'private', retention: { policy: 'source-owned', enforced: false } },
			{ id: 'user-decision', sensitivity: 'sensitive', retention: { policy: 'append-only-audit', enforced: true } },
			{ id: 'model-evaluation', sensitivity: 'private', retention: { policy: 'module-owned', enforced: false } }
		],
		panels: [
			{
				id: 'workspace',
				label: 'Council workspace',
				requires: 'panel.render',
				fields: [
					{ id: 'object.title', label: 'Object', data_class: 'property' },
					{ id: 'object.status', label: 'Status', data_class: 'user-decision' },
					{ id: 'object.voices', label: 'Voices', data_class: 'model-evaluation' }
				]
			}
		],
		databases: [
			{ id: 'primary', engine: 'sqlite', access: 'read-only', data_classes: ['property', 'model-evaluation'] },
			{ id: 'folio-state', engine: 'sqlite', access: 'read-write', data_classes: ['user-decision'] }
		],
		kill_switch: {
			global_env: 'FOLIO_MODULES_DISABLED',
			module_env: 'FOLIO_DISABLED_MODULES'
		}
	},
	enabled: isCouncilRegistered,
	database_paths: {
		primary: getCouncilDbPath,
		'folio-state': getFolioDbPath
	}
};
