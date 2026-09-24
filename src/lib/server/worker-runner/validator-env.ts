/** Preserve the parent environment while binding a validator child to its exact model fence. */
export function validatorProcessEnv(base: NodeJS.ProcessEnv, modelFenceToken?: string): NodeJS.ProcessEnv {
	return modelFenceToken ? { ...base, FOLIO_MODEL_FENCE_TOKEN: modelFenceToken } : { ...base };
}
