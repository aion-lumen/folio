#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { getFolioDb } from '../src/lib/server/folio-db/init.js';
import { confirmMemoryFactByHuman, findMemoryFactBySource, proposeMemoryFact } from '../src/lib/server/memory/store.js';
import type { MemorySensitivity } from '../src/lib/server/memory/types.js';

interface SeedFact {
	data_class: string;
	sensitivity: MemorySensitivity;
	subject: string;
	predicate: string;
	value: string;
	source_kind: string;
	source_ref: string;
	source_excerpt?: string;
}

function valueDe(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object') {
		const localized = value as Record<string, unknown>;
		return String(localized.de ?? localized.en ?? '');
	}
	return String(value ?? '');
}

function stringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (value && typeof value === 'object') {
		const localized = value as Record<string, unknown>;
		const selected = localized.de ?? localized.en;
		return Array.isArray(selected) ? selected.map(String) : [];
	}
	return [];
}

function args(): { cartaRoot: string; apply: boolean; actor: string } {
	const values = process.argv.slice(2);
	const at = (flag: string) => {
		const index = values.indexOf(flag);
		return index >= 0 ? values[index + 1] : undefined;
	};
	const cartaRoot = at('--carta-root') ?? process.env.CARTA_ROOT;
	if (!cartaRoot) throw new Error('use --carta-root /path/to/carta');
	return { cartaRoot: resolve(cartaRoot), apply: values.includes('--apply'), actor: at('--actor') ?? 'owner' };
}

function cvFacts(cv: Record<string, any>): SeedFact[] {
	const facts: SeedFact[] = [];
	const cvRef = 'carta:cv';
	facts.push({
		data_class: 'career_profile', sensitivity: 'public', subject: 'Afschin Mirhamed', predicate: 'professional_profile',
		value: valueDe(cv.profile), source_kind: 'carta-cv', source_ref: `${cvRef}:profile`, source_excerpt: valueDe(cv.profile)
	});
	facts.push({
		data_class: 'career_availability', sensitivity: 'private', subject: 'Afschin Mirhamed', predicate: 'availability',
		value: valueDe(cv.personal?.availability), source_kind: 'carta-cv', source_ref: `${cvRef}:availability`
	});

	for (const [index, certification] of (cv.certifications ?? []).entries()) {
		facts.push({
			data_class: 'career_credential', sensitivity: 'public', subject: certification.name, predicate: 'certified_by',
			value: `${certification.issuer}, ${valueDe(certification.date)}`, source_kind: 'carta-cv',
			source_ref: `${cvRef}:certification:${index}`
		});
	}
	for (const [index, language] of (cv.languages ?? []).entries()) {
		facts.push({
			data_class: 'career_language', sensitivity: 'public', subject: valueDe(language.name), predicate: 'level',
			value: valueDe(language.level), source_kind: 'carta-cv', source_ref: `${cvRef}:language:${index}`
		});
	}
	for (const [index, station] of (cv.timeline ?? []).entries()) {
		const details = stringList(station.details);
		facts.push({
			data_class: 'career_experience', sensitivity: 'private', subject: valueDe(station.company), predicate: 'documents_experience',
			value: [
				`${valueDe(station.role)} (${valueDe(station.from)}–${valueDe(station.to)})`,
				...details,
				station.tools?.length ? `Tools: ${station.tools.join(', ')}` : ''
			].filter(Boolean).join(' · '),
			source_kind: 'carta-cv', source_ref: `${cvRef}:timeline:${index}`,
			source_excerpt: details.slice(0, 2).join(' · ')
		});
	}
	for (const [group, projects] of Object.entries(cv.clientProjects ?? {})) {
		for (const [index, project] of (projects as any[]).entries()) {
			const tasks = stringList(project.tasks);
			facts.push({
				data_class: 'career_project_evidence', sensitivity: 'private', subject: project.client, predicate: 'documents_project',
				value: [
					`${valueDe(project.role)} (${valueDe(project.from)}–${valueDe(project.to)})`,
					...tasks,
					project.tools?.length ? `Tools: ${project.tools.join(', ')}` : ''
				].filter(Boolean).join(' · '),
				source_kind: 'carta-project-list', source_ref: `${cvRef}:client-project:${group}:${index}`,
				source_excerpt: tasks.slice(0, 2).join(' · ')
			});
		}
	}
	for (const [index, project] of (cv.projects ?? []).entries()) {
		facts.push({
			data_class: 'career_project_evidence', sensitivity: 'public', subject: project.name, predicate: 'documents_own_project',
			value: `${valueDe(project.description)} · ${valueDe(project.status)}`, source_kind: 'carta-cv',
			source_ref: `${cvRef}:own-project:${index}`
		});
	}
	return facts;
}

function handoffFacts(markdown: string): SeedFact[] {
	const required = [
		'eigenständige Erarbeitung strategischer Zielbilder auf C-Level-Niveau',
		'Deutsche Bank nicht als Referenz verwenden',
		'keine Pax-Planungsanwendung und kein Pax-MIS'
	];
	for (const phrase of required) {
		if (!markdown.includes(phrase)) throw new Error(`handoff lacks expected owner boundary: ${phrase}`);
	}
	return [
		{
			data_class: 'career_skill_boundary', sensitivity: 'private', subject: 'C-level strategy work', predicate: 'not_proven',
			value: 'Keine eigenständige Erarbeitung strategischer Zielbilder auf C-Level-Niveau und keine bisherige Beteiligung an Strategieprojekten belegt.',
			source_kind: 'carta-handoff', source_ref: 'carta:handoff:boundary:c-level-strategy'
		},
		{
			data_class: 'career_reference_permission', sensitivity: 'sensitive', subject: 'Deutsche Bank', predicate: 'reference_permission',
			value: 'Nicht als Referenz verwenden.', source_kind: 'carta-handoff', source_ref: 'carta:handoff:reference:deutsche-bank'
		},
		{
			data_class: 'career_skill_boundary', sensitivity: 'private', subject: 'PAX project scope', predicate: 'excludes',
			value: 'Keine PAX-Planungsanwendung und kein PAX-MIS behaupten.', source_kind: 'carta-handoff',
			source_ref: 'carta:handoff:boundary:pax-planning'
		}
	];
}

const input = args();
const cvPath = resolve(input.cartaRoot, 'src/lib/data/cv.json');
const handoffPath = resolve(input.cartaRoot, 'career/KARRIERE-SKILLS-FOLIO-HANDOFF.md');
const cv = JSON.parse(readFileSync(cvPath, 'utf8')) as Record<string, any>;
const handoff = readFileSync(handoffPath, 'utf8');
const facts = [...cvFacts(cv), ...handoffFacts(handoff)];

if (!input.apply) {
	console.log(JSON.stringify({ mode: 'dry-run', facts: facts.length, sources: [cvPath, handoffPath] }, null, 2));
	process.exit(0);
}

const backupDirectory = join(homedir(), '.folio', 'backups');
mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
const backupPath = join(backupDirectory, `folio-before-career-seed-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
await getFolioDb().backup(backupPath);
chmodSync(backupPath, 0o600);

let proposed = 0;
let confirmed = 0;
let existing = 0;
for (const fact of facts) {
	const prior = findMemoryFactBySource('career', fact.source_ref);
	if (prior) {
		if (prior.status === 'candidate') {
			confirmMemoryFactByHuman(prior.fact_id, input.actor);
			confirmed++;
		} else existing++;
		continue;
	}
	const candidate = proposeMemoryFact({
		domain: 'career', ...fact, derived_from_external: false, actor_kind: 'import', actor_id: 'carta-memory-seed'
	});
	proposed++;
	confirmMemoryFactByHuman(candidate.fact_id, input.actor);
	confirmed++;
}
console.log(JSON.stringify({ mode: 'applied', facts: facts.length, proposed, confirmed, existing, backupPath }, null, 2));
