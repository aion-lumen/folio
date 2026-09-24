/** Safe projection of explicit runner control lines; never expose raw mail text. */
export interface ModelActivity { model: string; task: string; }
export interface ValidatorLiveStatus { activity: ModelActivity | null; target: number | null; }
export function advanceValidatorStatus(previous: ValidatorLiveStatus, line: string): ValidatorLiveStatus {
 const next = { ...previous };
 const target = /\btarget rows: (\d+)\s*$/.exec(line);
 if (target) next.target = Number(target[1]);
 const start = /=== lens=\S+ model=(\S+) strip=\S+ ===/.exec(line);
 if (start) next.activity = {model:start[1], task:'Modell laden · Mail-Klassifikation'};
 const loaded = /wait_for_lens_model_loaded: (\S+) confirmed loaded/.exec(line);
 if (loaded && next.activity?.model === loaded[1]) next.activity = {...next.activity, task:'Mail-Klassifikation'};
 if (/validator_batch done:|model-swap to .* failed|has no disagreement rows — no model load/.test(line)) next.activity = null;
 return next;
}
