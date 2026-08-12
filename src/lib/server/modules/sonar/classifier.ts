import { callLmStudioJson } from '../../agent/llm.js';
import type {
	SonarFollowingProfile,
	SonarFollowingSuggestion,
	SonarFollowingSuggestionCategory
} from './following.js';

interface ClassificationResponse extends Record<string, unknown> {
	classifications?: unknown;
}

export interface FollowingClassification extends Pick<SonarFollowingSuggestion, 'category' | 'confidence' | 'reason'> {
	accountId: string;
}

export async function classifyFollowingBatch(
	profiles: readonly Pick<SonarFollowingProfile, 'accountId' | 'username' | 'name' | 'description'>[],
	model?: string
): Promise<FollowingClassification[]> {
	if (profiles.length === 0 || profiles.length > 24) {
		throw new Error('Following classification batch must contain 1–24 profiles');
	}
	const input = profiles.map((profile) => ({
		account_id: profile.accountId,
		username: profile.username,
		name: profile.name,
		bio: profile.description
	}));
	const prompt = `Classify X profiles for a human-reviewed account migration.

Return ONLY one JSON object in this exact shape:
{"classifications":[{"account_id":"...","category":"ai|politics|both|drop|unclear","confidence":0.0,"reason":"short factual reason"}]}

Categories:
- ai: primarily AI, ML, local models, agents, developer tooling, or AI research
- politics: primarily politics, public policy, geopolitics, democracy, activism, or political news
- both: substantial and explicit relevance to both AI/technology and politics/policy
- drop: clearly unrelated to both intended timelines
- unclear: bio is missing, ambiguous, or evidence is insufficient

Rules:
- Return every account_id exactly once and no unknown IDs.
- Use only name, username, and bio. Do not infer sensitive traits.
- Prefer unclear over guessing. Confidence must be between 0 and 1.
- Reason must be factual, in German, and at most 12 words.

Profiles:
${JSON.stringify(input)}`;
	const response = await callLmStudioJson<ClassificationResponse>(prompt, model, {
		reasoningEffort: 'low',
		maxTokens: Math.max(600, profiles.length * 100),
		acceptReasoningAsContent: true,
		responseFormat: {
			type: 'json_schema',
			json_schema: {
				name: 'following_classifications',
				strict: true,
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['classifications'],
					properties: {
						classifications: {
							type: 'array',
							minItems: profiles.length,
							maxItems: profiles.length,
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['account_id', 'category', 'confidence', 'reason'],
								properties: {
									account_id: { type: 'string', enum: profiles.map((profile) => profile.accountId) },
									category: { type: 'string', enum: ['ai', 'politics', 'both', 'drop', 'unclear'] },
									confidence: { type: 'number', minimum: 0, maximum: 1 },
									reason: { type: 'string', minLength: 1, maxLength: 240 }
								}
							}
						}
					}
				}
			}
		}
	});
	if (!response || !Array.isArray(response.classifications)) {
		throw new Error('Local model returned no usable following classifications');
	}

	const expected = new Set(profiles.map((profile) => profile.accountId));
	const seen = new Set<string>();
	const output: FollowingClassification[] = [];
	for (const item of response.classifications) {
		const value = item as Record<string, unknown>;
		const category = value.category as SonarFollowingSuggestionCategory;
		const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
		if (
			typeof value.account_id !== 'string' ||
			!expected.has(value.account_id) ||
			seen.has(value.account_id) ||
			!['ai', 'politics', 'both', 'drop', 'unclear'].includes(category) ||
			typeof value.confidence !== 'number' ||
			!Number.isFinite(value.confidence) ||
			value.confidence < 0 ||
			value.confidence > 1 ||
			!reason ||
			reason.length > 240
		) {
			throw new Error('Local model returned invalid following classifications');
		}
		seen.add(value.account_id);
		output.push({
			accountId: value.account_id,
			category,
			confidence: value.confidence,
			reason
		});
	}
	if (seen.size !== expected.size) {
		throw new Error('Local model omitted following profiles');
	}
	return output;
}
