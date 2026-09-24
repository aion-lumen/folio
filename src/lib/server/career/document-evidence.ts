import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { upsertMemorySourceCandidate } from '../memory/sources.js';
import {
	confirmMemoryFactByHuman,
	findConfirmedMemoryEntity,
	findMemoryFactBySource,
	listMemoryFactsBySource,
	proposeMemoryFact
} from '../memory/store.js';
import type { MemorySensitivity } from '../memory/types.js';

const personKey = () => process.env.FOLIO_CAREER_PERSON_KEY || 'career:person:owner';
const ALLOWED_PATH = /^career\/(?:zeugnisse|zertifikate)\/[^/]+$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export interface CareerEvidenceFactInput {
	data_class: string;
	subject: string;
	predicate: string;
	value: string;
	source_excerpt: string;
	sensitivity?: MemorySensitivity;
	valid_from?: string | null;
	supersedes_source_ref?: string | null;
}

export interface CareerEvidenceSourceInput {
	relative_path: string;
	sha256: string;
	title?: string;
	sensitivity?: MemorySensitivity;
	fact: CareerEvidenceFactInput;
}

export interface CareerEvidenceManifest {
	schema: 'folio/career-evidence-import/v1';
	sources: CareerEvidenceSourceInput[];
}

export interface CareerEvidenceValidation {
	sources: number;
	replacements: number;
	new_facts: number;
	bytes: number;
}

export interface CareerEvidenceImportResult extends CareerEvidenceValidation {
	proposed: number;
	confirmed: number;
	existing: number;
}

function sha256(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function checkedPath(root: string, input: CareerEvidenceSourceInput): string {
	if (isAbsolute(input.relative_path)) throw new Error(`relative_path must be relative: ${input.relative_path}`);
	const portable = input.relative_path.normalize('NFKC').replaceAll('\\', '/');
	if (!ALLOWED_PATH.test(portable)) throw new Error(`unsupported career evidence path: ${input.relative_path}`);
	const absolute = resolve(root, normalize(portable));
	const withinRoot = relative(resolve(root), absolute);
	if (!withinRoot || withinRoot.startsWith(`..${sep}`) || withinRoot === '..' || isAbsolute(withinRoot)) {
		throw new Error(`career evidence path escapes root: ${input.relative_path}`);
	}
	if (!statSync(absolute).isFile()) throw new Error(`career evidence is not a file: ${input.relative_path}`);
	if (!SHA256.test(input.sha256) || sha256(absolute) !== input.sha256) {
		throw new Error(`career evidence hash mismatch: ${input.relative_path}`);
	}
	return absolute;
}

function assertManifest(manifest: CareerEvidenceManifest): void {
	if (manifest.schema !== 'folio/career-evidence-import/v1' || !Array.isArray(manifest.sources)) {
		throw new Error('invalid career evidence manifest');
	}
	const hashes = new Set<string>();
	for (const source of manifest.sources) {
		if (hashes.has(source.sha256)) throw new Error(`duplicate content in manifest: ${source.sha256}`);
		hashes.add(source.sha256);
		if (!source.fact || !source.fact.source_excerpt.trim()) {
			throw new Error(`career evidence fact is incomplete: ${source.relative_path}`);
		}
	}
}

export function validateCareerEvidenceManifest(
	manifest: CareerEvidenceManifest,
	root: string
): CareerEvidenceValidation {
	assertManifest(manifest);
	let bytes = 0;
	let replacements = 0;
	for (const source of manifest.sources) {
		const absolute = checkedPath(root, source);
		bytes += statSync(absolute).size;
		if (source.fact.supersedes_source_ref) replacements += 1;
	}
	return {
		sources: manifest.sources.length,
		replacements,
		new_facts: manifest.sources.length - replacements,
		bytes
	};
}

export function importCareerEvidenceManifest(
	manifest: CareerEvidenceManifest,
	root: string,
	actorId: string
): CareerEvidenceImportResult {
	const validation = validateCareerEvidenceManifest(manifest, root);
	const person = findConfirmedMemoryEntity('career', 'person', personKey());
	if (!person) throw new Error('confirmed career person is required before document import');

	let proposed = 0;
	let confirmed = 0;
	let existing = 0;
	for (const source of manifest.sources) {
		const absolute = checkedPath(root, source);
		const sourceRef = `file:sha256:${source.sha256}`;
		upsertMemorySourceCandidate({
			source_kind: 'file',
			source_ref: sourceRef,
			title: source.title?.trim() || basename(absolute),
			relative_path: source.relative_path.normalize('NFKC').replaceAll('\\', '/'),
			content_hash: source.sha256,
			sensitivity: source.sensitivity ?? 'sensitive',
			primary_domain: 'career',
			reviewed_by: actorId
		});

		const priorForSource = listMemoryFactsBySource('career', sourceRef)
			.find((fact) => ['candidate', 'confirmed'].includes(fact.status));
		if (priorForSource) {
			if (
				priorForSource.data_class !== source.fact.data_class
				|| priorForSource.subject !== source.fact.subject
				|| priorForSource.predicate !== source.fact.predicate
				|| priorForSource.value_text !== source.fact.value
			) throw new Error(`existing fact differs for immutable source: ${source.relative_path}`);
			if (priorForSource.status === 'candidate') {
				confirmMemoryFactByHuman(priorForSource.fact_id, actorId);
				confirmed += 1;
			} else {
				existing += 1;
			}
			continue;
		}

		let supersedesFactId: string | null = null;
		if (source.fact.supersedes_source_ref) {
			const previous = findMemoryFactBySource('career', source.fact.supersedes_source_ref);
			if (!previous || previous.status !== 'confirmed') {
				throw new Error(`confirmed superseded fact not found: ${source.fact.supersedes_source_ref}`);
			}
			supersedesFactId = previous.fact_id;
		}
		const candidate = proposeMemoryFact({
			domain: 'career',
			data_class: source.fact.data_class,
			sensitivity: source.fact.sensitivity ?? 'private',
			subject: source.fact.subject,
			predicate: source.fact.predicate,
			value: source.fact.value,
			source_kind: 'career-document',
			source_ref: sourceRef,
			source_excerpt: source.fact.source_excerpt,
			derived_from_external: false,
			entity_ref: person.canonical_key,
			entity_type: person.entity_type,
			entity_label: person.canonical_label,
			subject_entity_id: person.entity_id,
			valid_from: source.fact.valid_from ?? null,
			supersedes_fact_id: supersedesFactId,
			actor_kind: 'import',
			actor_id: 'career-document-import'
		});
		proposed += 1;
		confirmMemoryFactByHuman(candidate.fact_id, actorId);
		confirmed += 1;
	}
	return { ...validation, proposed, confirmed, existing };
}
