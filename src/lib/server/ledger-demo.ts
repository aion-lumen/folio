import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

/** An explicit, isolated presentation. Never infer it from a user's active vault. */
export function isLedgerDemo(): boolean {
	return process.env.FOLIO_LEDGER_DEMO_ROOT !== undefined;
}

export function ledgerDemoRoot(): string {
	const root = process.env.FOLIO_LEDGER_DEMO_ROOT;
	if (!root || !isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root) {
		throw new Error('invalid_ledger_demo_root');
	}
	const marker = join(root, 'demo.json');
	if (!lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink()) throw new Error('invalid_ledger_demo_marker');
	const m = JSON.parse(readFileSync(marker, 'utf8'));
	if (m.schema !== 'folio/ledger-demo/v1' || m.synthetic !== true || m.mode !== 'saved-read-only') {
		throw new Error('invalid_ledger_demo_marker');
	}
	return root;
}

/** Run at startup, before serving the prepared tree. The launcher makes data read-only. */
export function validateLedgerDemoTree(): void {
	const root = ledgerDemoRoot();
	let count = 0;
	function visit(path: string) {
		if (++count > 5000) throw new Error('ledger_demo_tree_too_large');
		const stat = lstatSync(path);
		if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('unsafe_ledger_demo_tree');
		if (stat.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name));
	}
	visit(root);
}

/** Existing fixture paths must stay inside the root, including every ancestor. */
export function ledgerDemoFile(relative: string): string {
	const root = ledgerDemoRoot(), path = resolve(root, relative);
	if (!path.startsWith(root + sep) || realpathSync(path) !== path || !lstatSync(path).isFile()) {
		throw new Error('invalid_ledger_demo_file');
	}
	return path;
}

/** One small read surface; even GET endpoints elsewhere can have side effects. */
export function ledgerDemoRequestAllowed(method: string, pathname: string, hostname: string, requestHost = hostname): boolean {
	if (!['GET', 'HEAD'].includes(method) || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return false;
	// adapter-node's ORIGIN can override event.url; validate the actual Host as well.
	if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(requestHost)) return false;
	const path = pathname.replace(/\/__data\.json$/, '');
	return ['/', '/demo/ledger', '/ledger/wealth', '/api/ledger/household/expenses', '/api/ledger/household/entries'].includes(path)
		|| /^\/api\/ledger\/household\/entries\/txn_[a-f0-9]{16,64}$/.test(path)
		|| /^\/api\/ledger\/household\/entries\/txn_[a-f0-9]{16,64}\/documents\/statement\/[a-f0-9]{64}$/.test(path)
		|| /^\/api\/ledger\/demo-documents\/[a-z0-9-]{1,40}$/.test(path);
}
