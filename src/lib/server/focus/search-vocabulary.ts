/** Small, auditable vocabulary bridges. These add query terms, never facts or verdicts. */
const NON_LEARNING=/(?<![\p{L}\p{N}])(?:assessments?[\s-]*cent(?:er|re)s?|(?:risk|risiko|security|impact|self|selbst)[\s-]*assessments?)(?![\p{L}\p{N}])/giu;
const LEARNING=/(?<![\p{L}\p{N}])(?:wissens[\s-]*tests?|kenntnis[\s-]*(?:tests?|prüfung(?:en)?)|kompetenz[\s-]*(?:tests?|prüfung(?:en)?)|einstufungs[\s-]*tests?|assessments?|knowledge\s+tests?|competency\s+(?:tests?|assessments?))(?![\p{L}\p{N}])/iu;
export const ASSESSMENT_TERMS=['assessment','wissenstest','kenntnistest','kompetenztest'];
export function memoryVocabulary(query: string): string[] {
 // Remove distinct senses before looking for a learning assessment. Other
 // explicit learning words in the same request may still justify the bridge.
 return LEARNING.test(query.replace(NON_LEARNING,' ')) ? [...ASSESSMENT_TERMS] : [];
}
export function onlyNonLearningAssessment(text:string):boolean {
 return text.replace(NON_LEARNING,' ')!==text && memoryVocabulary(text).length===0;
}
