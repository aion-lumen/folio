// Council-spezifische Lens-Runner-Config. Liegt unter src/lib/council/ damit
// das generische lens-runner-framework domain-agnostic bleibt (Klausel 9).
// Job/Kampagne kommen mit eigenen lens-config.server.ts in ihren Modulen.

import { join } from 'path';
import { homedir } from 'os';
import type { LensRunConfig } from '$lib/server/lens-runner/types.js';
import { getCouncilConfigPath } from '$lib/server/env.js';

const AION_LUMEN_ROOT = join(getCouncilConfigPath(), '..', '..');

export const COUNCIL_LENS_CONFIG: LensRunConfig = {
	domain: 'council',
	python_bin: join(AION_LUMEN_ROOT, 'council', '.venv', 'bin', 'python3'),
	worker_script: join(AION_LUMEN_ROOT, 'council', 'scripts', 'council_lens_run.py'),
	cwd: join(AION_LUMEN_ROOT, 'council'),
	lockfile_path: join(homedir(), '.council', 'lens-run.lock'),
	log_dir: join(AION_LUMEN_ROOT, 'council', 'data'),
	log_prefix: 'lens-run-ui'
};
