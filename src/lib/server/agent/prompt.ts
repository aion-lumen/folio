import type { ParsedInboxDocument } from '../inbox/types.js';
import type { CampaignContext } from './context.js';
import { formatCampaignContextForPrompt } from './context.js';

export type PromptVariant = 'v1' | 'v1-strict';

// Explicit operational default. Was always 'v1' — but only as an implicit `?? 'v1'` literal, which is
// exactly why an outward claim of "v1-strict" could stand for weeks without anything catching it (a
// property assumed, never asserted — same class as the name-proxy field-note). Naming it + a regression
// test locks the default against silent drift. v1-strict stays available as an opt-in (API promptVariant).
// Hermetic 3-model eval (results-2026-07-09.json): v1 = 13/14, FP 0; v1-strict = 11/14 (demotes real tasks
// via the "chapter fit is weak" rule, e.g. lead-freelance-devops → unclear).
export const DEFAULT_PROMPT_VARIANT: PromptVariant = 'v1';

const BASE_RULES = `You are the Folio inbox triage agent. Read an imported markdown document and decide whether it describes a **new campaign objective** (a concrete, actionable goal with a clear completion threshold).

Return ONLY valid JSON (no markdown fences):
{
  "verdict": "task" | "unclear" | "not-a-task",
  "confidence": 0.0-1.0,
  "chapter_slug": "<chapter slug or null>",
  "objective": {
    "title": "<short objective title>",
    "threshold": "<measurable completion criterion>",
    "weight": 1.0,
    "related_goals": ["goal-tag"],
    "deadline": "YYYY-MM-DD or omit"
  } | null,
  "reasoning": "<max 200 chars, German ok>"
}

Rules:
- verdict "task": document clearly requests a new actionable campaign goal; you can map it to an existing chapter and draft a complete objective.
- verdict "unclear": might be a task but chapter, threshold, or intent is ambiguous — human must review.
- verdict "not-a-task": field notes, status updates, observations, directives without a new goal, or content that should stay as import/note only.
- objective is required when verdict is "task", null otherwise.
- chapter_slug must be an existing chapter slug from the context when verdict is "task".
- weight between 0.5 and 3.0.
- related_goals: use tags like karriere, finanzen, ai-bauen, familie, schweiz when fitting.
- confidence: how sure you are that auto-creating an objective is correct (not just that it's a task).`;

const STRICT_EXTRA = `
- Prefer "unclear" over "task" when threshold is vague or chapter fit is weak.
- Never invent deadlines unless explicitly stated in the document.
- Field notes and retrospective observations are "not-a-task" even if they mention work.`;

export function buildTriagePrompt(
	doc: ParsedInboxDocument,
	ctx: CampaignContext,
	variant: PromptVariant = DEFAULT_PROMPT_VARIANT
): string {
	const fm = doc.frontmatter;
	const extra = variant === 'v1-strict' ? STRICT_EXTRA : '';
	return `${BASE_RULES}${extra}

${formatCampaignContextForPrompt(ctx)}

## Document to triage
filename: ${doc.filename}
frontmatter:
  type: ${fm.type}
  target: ${fm.target}
  id: ${fm.id}
  source: ${fm.source}
  title: ${fm.title ?? '(none)'}

body:
${doc.body.slice(0, 4000)}`;
}
