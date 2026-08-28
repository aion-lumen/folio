#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	careerIdentityKey,
	ensureCareerCase,
	recordCareerAssessment
} from '../src/lib/server/career/store.js';
import type {
	CareerEvidenceState,
	CareerPositionInput,
	CareerRequirement,
	CareerRequirementClass
} from '../src/lib/server/career/types.js';
import { findMemoryFactBySource } from '../src/lib/server/memory/store.js';

interface RequirementInput {
	text: string;
	class: CareerRequirementClass;
	evidence_state: CareerEvidenceState;
	evidence_source_refs?: string[];
	note?: string;
}

interface AssessmentInput {
	position: Omit<CareerPositionInput, 'identity_key'> & { identity_key?: string };
	requirements: RequirementInput[];
}

function required(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`);
	return value.trim();
}

function inputPath(): string {
	const values = process.argv.slice(2);
	const index = values.indexOf('--input');
	const value = index >= 0 ? values[index + 1] : undefined;
	if (!value) throw new Error('use --input /path/to/assessment.json');
	return resolve(value);
}

function loadInput(path: string): AssessmentInput {
	const value = JSON.parse(readFileSync(path, 'utf8')) as AssessmentInput;
	if (!value.position || !Array.isArray(value.requirements)) throw new Error('input requires position and requirements');
	return value;
}

function resolveRequirements(input: RequirementInput[]): CareerRequirement[] {
	return input.map((requirement, index) => {
		const sourceRefs = requirement.evidence_source_refs ?? [];
		if (!Array.isArray(sourceRefs)) throw new Error(`requirements[${index}].evidence_source_refs must be an array`);
		const facts = sourceRefs.map((sourceRef) => {
			const fact = findMemoryFactBySource('career', required(sourceRef, `requirements[${index}] source ref`));
			if (!fact || fact.status !== 'confirmed') {
				throw new Error(`career evidence is not confirmed: ${sourceRef}`);
			}
			return fact;
		});
		return {
			text: required(requirement.text, `requirements[${index}].text`),
			class: requirement.class,
			evidence_state: requirement.evidence_state,
			evidence_fact_ids: facts.map((fact) => fact.fact_id),
			note: requirement.note
		};
	});
}

const input = loadInput(inputPath());
const position = input.position;
const sourceKind = required(position.source_kind, 'position.source_kind');
const careerCase = ensureCareerCase({
	...position,
	identity_key: position.identity_key ?? careerIdentityKey(sourceKind, position.external_id, position.source_url),
	source_kind: sourceKind,
	source_ref: required(position.source_ref, 'position.source_ref'),
	employer: required(position.employer, 'position.employer'),
	title: required(position.title, 'position.title'),
	checked_at: required(position.checked_at, 'position.checked_at')
});
const assessment = recordCareerAssessment(careerCase.case_id, resolveRequirements(input.requirements), 'owner');

console.log(JSON.stringify({
	case_id: careerCase.case_id,
	employer: careerCase.employer,
	title: careerCase.title,
	decision: assessment.decision,
	blockers: assessment.blockers,
	reason: assessment.reason,
	evidence_facts: assessment.context_fact_ids.length,
	policy_version: assessment.policy_version
}, null, 2));
