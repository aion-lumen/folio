import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModuleRegistration } from '../types.js';

export const LEUCHTFEUER_MODULE: ModuleRegistration = {
	manifest: {
		schema: 'folio/module-manifest/v1',
		id: 'leuchtfeuer',
		label: 'Leuchtfeuer',
		version: '1',
		capabilities: [
			{ id: 'panel.render', kind: 'render', description: 'Render aggregate traffic panels.' },
			{ id: 'metrics.read', kind: 'read', description: 'Read server-log and repository aggregates.' }
		],
		data_classes: [
			{
				id: 'traffic-aggregate',
				sensitivity: 'aggregate',
				retention: { policy: 'reader-window-30-days', enforced: false }
			}
		],
		panels: [
			{
				id: 'metrics',
				label: 'Leuchtfeuer metrics',
				requires: 'panel.render',
				fields: [
					{ id: 'site.visits', label: 'Site visits', data_class: 'traffic-aggregate' },
					{ id: 'site.paths', label: 'Top paths', data_class: 'traffic-aggregate' },
					{ id: 'repo.traffic', label: 'Repository traffic', data_class: 'traffic-aggregate' }
				]
			}
		],
		databases: [
			{ id: 'metrics', engine: 'filesystem', access: 'read-only', data_classes: ['traffic-aggregate'] }
		],
		kill_switch: {
			global_env: 'FOLIO_MODULES_DISABLED',
			module_env: 'FOLIO_DISABLED_MODULES'
		}
	},
	enabled: () => true,
	database_paths: {
		metrics: () => join(homedir(), '.folio', 'metrics')
	}
};
