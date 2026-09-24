import { homedir } from 'node:os';
import { join } from 'node:path';
import { getVaultPath, isDemoVaultActive } from '../../env.js';
import type { ModuleRegistration } from '../types.js';

export const SONAR_MODULE: ModuleRegistration = {
	manifest: {
		schema: 'folio/module-manifest/v1',
		id: 'sonar',
		label: 'Sonar',
		version: '6',
		capabilities: [
			{ id: 'panel.render', kind: 'render', description: 'Render the Sonar review workspace.' },
			{ id: 'notes.read', kind: 'read', description: 'Read external-derived Sonar notes from the active vault.' },
			{ id: 'reviews.read', kind: 'read', description: 'Read recorded human review decisions.' },
			{ id: 'archive.read', kind: 'read', description: 'Read aggregate metadata from a local normalized X archive.' },
			{ id: 'placements.read', kind: 'read', description: 'Read normalized cross-channel placement candidates.' },
			{ id: 'search.read', kind: 'read', description: 'Read bounded Sonar placement-search run state.' },
			{ id: 'search.execute', kind: 'execute', description: 'Start one configured, single-flight placement search.' },
			{ id: 'review.write', kind: 'write', description: 'Append explicit human review decisions.' },
			{
				id: 'publish.approve',
				kind: 'write',
				description: 'Record a revision-bound human publishing approval without network access.'
			},
			{ id: 'publish.read', kind: 'read', description: 'Read bounded publication claim and receipt state.' },
			{
				id: 'publish.execute',
				kind: 'execute',
				description: 'Execute one previously approved publication through a separately authenticated adapter.'
			}
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
			},
			{
				id: 'placement-candidate',
				sensitivity: 'private',
				retention: { policy: 'source-expiry-declared', enforced: false }
			},
			{
				id: 'publication-event',
				sensitivity: 'sensitive',
				retention: { policy: 'append-only-audit', enforced: true }
			},
			{
				id: 'search-run',
				sensitivity: 'aggregate',
				retention: { policy: 'local-runtime-history', enforced: false }
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
					{ id: 'archive.following-review', label: 'Following review', data_class: 'review-decision' },
					{ id: 'placement.source', label: 'Placement source', data_class: 'placement-candidate' },
					{ id: 'placement.draft', label: 'Placement draft', data_class: 'placement-candidate' },
					{ id: 'placement.review', label: 'Placement review', data_class: 'review-decision' },
					{ id: 'placement.search-run', label: 'Placement search run', data_class: 'search-run' },
					{
						id: 'placement.publish-approval',
						label: 'Placement publish approval',
						data_class: 'review-decision'
					},
					{
						id: 'placement.publication',
						label: 'Placement publication state',
						data_class: 'publication-event'
					}
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
			},
			{
				id: 'placement-candidates',
				engine: 'filesystem',
				access: 'read-only',
				data_classes: ['placement-candidate']
			},
			{
				id: 'publish-state',
				engine: 'filesystem',
				access: 'read-write',
				data_classes: ['publication-event']
			},
			{
				id: 'search-state',
				engine: 'filesystem',
				access: 'read-write',
				data_classes: ['search-run']
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
				: join(homedir(), '.folio', 'sonar'),
		'placement-candidates': () => join(getVaultPath(), 'internal', 'sonar', 'placements'),
		'publish-state': () =>
			isDemoVaultActive()
				? join(homedir(), '.folio', 'sonar-demo', 'publisher')
				: join(homedir(), '.folio', 'sonar-publisher'),
		'search-state': () =>
			isDemoVaultActive()
				? join(homedir(), '.folio', 'sonar-demo', 'search')
				: join(homedir(), '.folio', 'sonar-search')
	}
};
