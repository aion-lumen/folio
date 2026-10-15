import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const retrieval = vi.hoisted(() => ({ lexical: vi.fn(), hybrid: vi.fn() }));
vi.mock('./memory.js', () => ({ companionMemory: retrieval.lexical, companionMemoryHybrid: retrieval.hybrid }));
import { memoryForAnswerModel } from './memory-for-model.js';

describe('per-model semantic answer acceptance', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('FOLIO_MEMORY_SEMANTIC', '1');
  vi.stubEnv('FOLIO_MEMORY_SEMANTIC_ANSWER_MODELS', 'accepted-model');
  retrieval.lexical.mockReturnValue(['original-context']);
  retrieval.hybrid.mockResolvedValue(['augmented-context']);
 });
 afterEach(() => vi.unstubAllEnvs());

 it('uses the accepted model with the full request context', async () => {
  const history = [{ role: 'user', text: 'earlier question' }];
  expect(await memoryForAnswerModel('accepted-model', 'question', 'case', history)).toEqual(['augmented-context']);
  expect(retrieval.hybrid).toHaveBeenCalledWith('question', 'case', history);
  expect(retrieval.lexical).not.toHaveBeenCalled();
 });
 it.each(['different-dialogue-model', 'accepted-model-v2', undefined])('preserves lexical behavior for unaccepted model %s', async model => {
  expect(await memoryForAnswerModel(model, 'question')).toEqual(['original-context']);
  expect(retrieval.hybrid).not.toHaveBeenCalled();
 });
 it('requires explicit model acceptance even when embeddings are enabled', async () => {
  vi.stubEnv('FOLIO_MEMORY_SEMANTIC_ANSWER_MODELS', '');
  expect(await memoryForAnswerModel('accepted-model', 'question')).toEqual(['original-context']);
  expect(retrieval.hybrid).not.toHaveBeenCalled();
 });
 it('honors the global rollback switch', async () => {
  vi.stubEnv('FOLIO_MEMORY_SEMANTIC', '0');
  expect(await memoryForAnswerModel('accepted-model', 'question')).toEqual(['original-context']);
  expect(retrieval.hybrid).not.toHaveBeenCalled();
 });
});
