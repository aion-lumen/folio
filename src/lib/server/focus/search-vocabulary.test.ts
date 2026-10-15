import {it,expect} from 'vitest';
import {memoryVocabulary} from './search-vocabulary.js';
it.each(['Weshalb komme ich nicht in den Wissenstest hinein?','Der Kenntnistest öffnet sich nicht.','Cannot open my competency assessment.','Where is the knowledge test?'])('bridges assessment wording: %s',q=>{
 expect(memoryVocabulary(q)).toContain('assessment');
});
it.each(['Weshalb komme ich nicht in das Haus hinein?','Der medizinische Test ist offen.','Mein Unit Test schlägt fehl.','Was steht in meiner Wissensdatenbank?'])('does not conflate unrelated meanings: %s',q=>{
 expect(memoryVocabulary(q)).toEqual([]);
});

it.each(['Wissenstests','Assessments','Kenntnisprüfungen','Wissens-Test','Kenntnisprüfung','Kompetenzprüfungen'])('bridges inflection and hyphens: %s',q=>expect(memoryVocabulary(q)).toContain('assessment'));
it.each(['Assessment-Center','Assessmentcenter','Assessment Center','Risk Assessment','Self-Assessment','Impact assessments'])('does not expand a distinct sense: %s',q=>expect(memoryVocabulary(q)).toEqual([]));
