import { getFolioDbPath } from '../../env.js';
import type { ModuleRegistration } from '../types.js';

export const CAREER_MODULE: ModuleRegistration = {
	manifest: {
		schema: 'folio/module-manifest/v1',
		id: 'career',
		label: 'Karriere',
		version: '2',
		capabilities: [
			{ id: 'panel.render', kind: 'render', description: 'Render the owner-only career lead panel.' },
			{ id: 'cases.read', kind: 'read', description: 'Read local career cases and fit assessments.' },
			{ id: 'cases.write', kind: 'write', description: 'Create local career cases.' },
			{ id: 'assessments.write', kind: 'write', description: 'Append evidence-bound fit assessments.' },
			{ id: 'leads.read', kind: 'read', description: 'Read projected high-fit career leads.' },
			{ id: 'events.write', kind: 'write', description: 'Append owner career lead decisions without external execution.' },
			{ id: 'alerts.read', kind: 'read', description: 'Read persistent career alert state.' }
		],
		data_classes: [
			{ id: 'position', sensitivity: 'private', retention: { policy: 'owner-managed', enforced: false } },
			{ id: 'fit-assessment', sensitivity: 'sensitive', retention: { policy: 'append-only-audit', enforced: true } },
			{ id: 'lead-event', sensitivity: 'sensitive', retention: { policy: 'append-only-audit', enforced: true } }
		],
		panels: [{
			id: 'career-mobile',
			label: 'Career mobile lead queue',
			requires: 'panel.render',
			fields: [
				{ id: 'lead.position', label: 'Position', data_class: 'position' },
				{ id: 'lead.assessment', label: 'Fit assessment', data_class: 'fit-assessment' },
				{ id: 'lead.event', label: 'Owner decision', data_class: 'lead-event' }
			]
		}],
		databases: [
			{ id: 'folio-state', engine: 'sqlite', access: 'read-write', data_classes: ['position', 'fit-assessment', 'lead-event'] }
		],
		kill_switch: { global_env: 'FOLIO_MODULES_DISABLED', module_env: 'FOLIO_DISABLED_MODULES' }
	},
	enabled: () => true,
	database_paths: { 'folio-state': getFolioDbPath }
};
