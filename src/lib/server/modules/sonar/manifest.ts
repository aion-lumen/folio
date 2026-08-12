import { homedir } from 'node:os';
import { join } from 'node:path';
import { getVaultPath, isDemoVaultActive } from '../../env.js';
import type { ModuleRegistration } from '../types.js';

export const SONAR_MODULE: ModuleRegistration = {
	manifest: {
		schema: 'folio/module-manifest/v1',
		id: 'sonar',
		label: 'Sonar',
		version: '1',
		capabilities: [
			{ id: 'panel.render', kind: 'render', description: 'Render the Sonar review workspace.' },
			{ id: 'notes.read', kind: 'read', description: 'Read external-derived Sonar notes from the active vault.' },
			{ id: 'reviews.read', kind: 'read', description: 'Read recorded human review decisions.' },
			{ id: 'archive.read', kind: 'read', description: 'Read aggregate metadata from a local normalized X archive.' },
			{ id: 'review.write', kind: 'write', description: 'Append explicit human review decisions.' }
		],
		data_classes: [
			{
				id: 'external-note',
				sensitivity: 'private',
				retention: { policy: 'vault-owned', enforced: false }
			},
			{
				id: 'review-decision',
				sensitivity: 'sensitive',
				retention: { policy: 'append-only-audit', enforced: true }
			},
			{
				id: 'archive-metadata',
				sensitivity: 'private',
				retention: { policy: 'local-user-controlled', enforced: false }
			}
		],
		panels: [
			{
				id: 'review-workspace',
				label: 'Sonar review workspace',
				requires: 'panel.render',
				fields: [
					{ id: 'note.signal', label: 'Signal', data_class: 'external-note' },
					{ id: 'note.context', label: 'Context', data_class: 'external-note' },
					{ id: 'note.review', label: 'Review', data_class: 'review-decision' },
					{ id: 'archive.summary', label: 'Archive summary', data_class: 'archive-metadata' },
					{ id: 'archive.following', label: 'Following profiles', data_class: 'archive-metadata' },
					{ id: 'archive.following-suggestion', label: 'Local following suggestion', data_class: 'archive-metadata' },
					{ id: 'archive.following-review', label: 'Following review', data_class: 'review-decision' }
				]
			}
		],
		databases: [
			{
				id: 'vault-notes',
				engine: 'filesystem',
				access: 'read-only',
				data_classes: ['external-note']
			},
			{
				id: 'review-state',
				engine: 'filesystem',
				access: 'read-write',
				data_classes: ['review-decision']
			},
			{
				id: 'archive-cache',
				engine: 'filesystem',
				access: 'read-only',
				data_classes: ['archive-metadata']
			}
		],
		kill_switch: {
			global_env: 'FOLIO_MODULES_DISABLED',
			module_env: 'FOLIO_DISABLED_MODULES'
		}
	},
	enabled: () => true,
	database_paths: {
		'vault-notes': () => join(getVaultPath(), 'internal', 'sonar'),
		'review-state': () =>
			isDemoVaultActive()
				? join(homedir(), '.folio', 'sonar-demo')
				: join(getVaultPath(), 'internal', 'sonar'),
		'archive-cache': () =>
			isDemoVaultActive()
				? join(getVaultPath(), 'internal', 'sonar', 'archive-cache')
				: join(homedir(), '.folio', 'sonar')
	}
};
