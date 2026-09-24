import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

export type ModelEvalCandidate = {
	id: string;
	label: string;
	model_id: string;
	response_strip: 'code_fence' | 'think' | 'none';
	variant: string;
	default: boolean;
};

export type ModelEvalCatalog = {
	schema: 'folio/model-eval-catalog/v1';
	suite: { id: string; label: string; cases: number };
	candidates: ModelEvalCandidate[];
};

const SAFE_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;

function requiredString(value: unknown, label: string, max: number): string {
	if (typeof value !== 'string' || !value.trim() || value.length > max) {
		throw new Error(`Invalid model-eval ${label}`);
	}
	return value.trim();
}

export function parseModelEvalCatalog(value: unknown): ModelEvalCatalog {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Invalid model-eval catalog');
	}
	const raw = value as Record<string, unknown>;
	if (raw.schema !== 'folio/model-eval-catalog/v1') throw new Error('Unsupported model-eval catalog');
	if (!raw.suite || typeof raw.suite !== 'object' || Array.isArray(raw.suite)) {
		throw new Error('Invalid model-eval suite');
	}
	const suiteRaw = raw.suite as Record<string, unknown>;
	const suite = {
		id: requiredString(suiteRaw.id, 'suite id', 80),
		label: requiredString(suiteRaw.label, 'suite label', 120),
		cases: Number(suiteRaw.cases)
	};
	if (!Number.isSafeInteger(suite.cases) || suite.cases < 1 || suite.cases > 500) {
		throw new Error('Invalid model-eval case count');
	}
	if (!Array.isArray(raw.candidates) || raw.candidates.length < 1 || raw.candidates.length > 12) {
		throw new Error('Invalid model-eval candidates');
	}
	const seen = new Set<string>();
	const candidates = raw.candidates.map((item): ModelEvalCandidate => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid model-eval candidate');
		const candidate = item as Record<string, unknown>;
		const id = requiredString(candidate.id, 'candidate id', 64);
		const modelId = requiredString(candidate.model_id, 'model id', 160);
		if (!SAFE_ID.test(id) || seen.has(id)) throw new Error('Invalid or duplicate model-eval candidate id');
		if (!SAFE_MODEL.test(modelId)) throw new Error('Invalid model-eval model id');
		seen.add(id);
		const strip = candidate.response_strip;
		if (strip !== 'code_fence' && strip !== 'think' && strip !== 'none') {
			throw new Error('Invalid model-eval response strip');
		}
		return {
			id,
			label: requiredString(candidate.label, 'candidate label', 100),
			model_id: modelId,
			response_strip: strip,
			variant: requiredString(candidate.variant, 'candidate variant', 80),
			default: candidate.default === true
		};
	});
	return { schema: 'folio/model-eval-catalog/v1', suite, candidates };
}

export function loadModelEvalCatalog(path = join(process.cwd(), 'config', 'model-eval.yaml')): ModelEvalCatalog {
	return parseModelEvalCatalog(YAML.parse(readFileSync(path, 'utf8')) as unknown);
}
