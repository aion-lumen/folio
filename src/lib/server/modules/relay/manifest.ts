import { getFolioDbPath, getSessionBridgePath, getSessionExchangePath } from '../../env.js';
import type { ModuleRegistration } from '../types.js';

export const RELAY_MODULE: ModuleRegistration = {
	manifest: {
		schema: 'folio/module-manifest/v1',
		id: 'relay',
		label: 'Übergaben',
		version: '1',
		capabilities: [
			{ id: 'panel.render', kind: 'render', description: 'Render the Session Relay review workspace.' },
			{ id: 'targets.configure', kind: 'write', description: 'Create an explicit local session-target manifest.' },
			{ id: 'cases.read', kind: 'read', description: 'Read case metadata and staged previews.' },
			{ id: 'cases.stage', kind: 'write', description: 'Stage a provider-neutral case locally.' },
			{ id: 'egress.approve', kind: 'write', description: 'Record human approval for one exact cloud-bound request.' },
			{ id: 'cases.share', kind: 'execute', description: 'Share an approved request through its declared adapter.' },
			{ id: 'responses.read', kind: 'read', description: 'Validate provider-neutral responses from a target outbox.' },
			{ id: 'responses.apply', kind: 'write', description: 'Apply one human-reviewed response inside Folio.' }
		],
		data_classes: [
			{ id: 'case-content', sensitivity: 'sensitive', retention: { policy: 'target-declared', enforced: true } },
			{ id: 'egress-decision', sensitivity: 'sensitive', retention: { policy: 'append-only-audit', enforced: true } }
		],
		panels: [{
			id: 'review-workspace', label: 'Übergaben', requires: 'panel.render',
			fields: [
				{ id: 'case.preview', label: 'Fall', data_class: 'case-content' },
				{ id: 'case.approval', label: 'Freigabe', data_class: 'egress-decision' },
				{ id: 'case.response', label: 'Session-Antwort', data_class: 'case-content' }
			]
		}],
		databases: [
			{ id: 'folio-state', engine: 'sqlite', access: 'read-write', data_classes: ['egress-decision'] },
			{ id: 'exchange', engine: 'filesystem', access: 'read-write', data_classes: ['case-content'] },
			{ id: 'bridge', engine: 'filesystem', access: 'read-write', data_classes: ['case-content'] }
		],
		kill_switch: { global_env: 'FOLIO_MODULES_DISABLED', module_env: 'FOLIO_DISABLED_MODULES' }
	},
	enabled: () => true,
	database_paths: {
		'folio-state': getFolioDbPath,
		exchange: getSessionExchangePath,
		bridge: getSessionBridgePath
	}
};
