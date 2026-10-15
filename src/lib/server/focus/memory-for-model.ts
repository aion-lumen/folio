import { companionMemory, companionMemoryHybrid } from './memory.js';

/** Answer quality must be accepted separately for each model. Preview retrieval is independent. */
export async function memoryForAnswerModel(model: unknown, question: string, caseTitle = '', history?: unknown) {
 const accepted = (process.env.FOLIO_MEMORY_SEMANTIC_ANSWER_MODELS ?? '').split(',').map(value => value.trim()).filter(Boolean);
 if (process.env.FOLIO_MEMORY_SEMANTIC === '1' && typeof model === 'string' && accepted.includes(model)) {
  return companionMemoryHybrid(question, caseTitle, history);
 }
 return companionMemory(question, caseTitle, history);
}
