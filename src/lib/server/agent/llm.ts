import { getFolioAgentModel, getLmStudioBaseUrl } from '../env.js';
import { resolveTriageModel } from './preflight.js';

export type LlmCallFn = (prompt: string, model: string) => Promise<string | null>;

export interface LlmCallOptions {
	responseFormat?: Record<string, unknown>;
	reasoningEffort?: 'low' | 'medium' | 'high';
	maxTokens?: number;
	acceptReasoningAsContent?: boolean;
}

const LLM_TIMEOUT_MS = 90_000;

let _override: LlmCallFn | null = null;

/** Test hook: inject mock LLM responses. */
export function setLlmOverride(fn: LlmCallFn | null): void {
	_override = fn;
}

export function stripLlmResponse(text: string): string {
	let t = text.trim();
	// qwen-thinking models wrap JSON in redacted_thinking blocks
	t = t.replace(/<think>[\s\S]*?<\/redacted_thinking>/g, '').trim();
	const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
	if (fence) t = fence[1].trim();
	return t;
}

export async function callLmStudio(
	prompt: string,
	model?: string,
	options?: LlmCallOptions
): Promise<string | null> {
	const mock = process.env.FOLIO_AGENT_MOCK_RESPONSE;
	if (mock !== undefined) return mock || null;
	if (_override) return _override(prompt, model ?? getFolioAgentModel());

	const resolved = model ?? (await resolveTriageModel()).model;
	if (!resolved) return null;

	const base = getLmStudioBaseUrl();
	try {
		const res = await fetch(`${base}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: resolved,
				messages: [{ role: 'user', content: prompt }],
				temperature: 0,
				...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
				...(options?.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
				...(options?.maxTokens ? { max_tokens: options.maxTokens } : {})
			}),
			signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
		};
		const message = data.choices?.[0]?.message;
		return message?.content?.trim()
			? message.content
			: options?.acceptReasoningAsContent
				? message?.reasoning_content ?? null
				: null;
	} catch {
		return null;
	}
}

export async function callLmStudioJson<T extends Record<string, unknown>>(
	prompt: string,
	model?: string,
	options?: LlmCallOptions
): Promise<T | null> {
	const raw = await callLmStudio(prompt, model, options);
	if (!raw) return null;
	const stripped = stripLlmResponse(raw);
	try {
		return JSON.parse(stripped) as T;
	} catch {
		return null;
	}
}
