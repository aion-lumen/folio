import { embeddingConfig } from '../src/lib/server/memory/embedding.js';
import { indexMemoryVectors } from '../src/lib/server/memory/semantic.js';

// Explicit operator command. It changes only the disposable sidecar projection.
const config = embeddingConfig();
if (!config) throw new Error('Set FOLIO_MEMORY_SEMANTIC=1 and the local embedding profile first.');
console.log(JSON.stringify(await indexMemoryVectors(config), null, 2));
