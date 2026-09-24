import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, lstatSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export type NasMountMode = 'read-only' | 'read-write';
export type ReorgCampaignSourceMode = 'dedicated-reader' | 'one-time-migration' | 'one-time-read-only';

export interface ReorgCampaignSource {
	root: string;
	mode: ReorgCampaignSourceMode;
}

export interface NasMountStatus {
	root: string;
	mounted: boolean;
	mode: NasMountMode | null;
	source: string | null;
	filesystem: string | null;
	writable: boolean;
	error: string | null;
}

export interface NasInfrastructureStatus {
	read: NasMountStatus;
	write: NasMountStatus;
	same_share: boolean | null;
	write_is_ephemeral: true;
}

interface InspectOptions {
	mountOutput?: string;
	expectedUsername?: string;
	serverEnforcedReadOnly?: boolean;
}

function absoluteConfiguredPath(value: string | undefined, fallback: string): string {
	const configured = value?.trim() || fallback;
	if (!isAbsolute(configured)) throw new Error('Der NAS-Mount-Pfad muss absolut sein.');
	return resolve(configured);
}

export function getNasReadMountPath(): string {
	return absoluteConfiguredPath(process.env.FOLIO_NAS_READ_ROOT ?? process.env.FOLIO_REORG_ROOT, '/Volumes/folio-reorg-test');
}

export function getNasWriteMountPath(): string {
	return absoluteConfiguredPath(process.env.FOLIO_NAS_WRITE_ROOT ?? process.env.FOLIO_REORG_WRITE_ROOT, getNasReadMountPath());
}

export function getNasMountHelperPath(): string {
	return absoluteConfiguredPath(process.env.FOLIO_NAS_MOUNT_HELPER, join(homedir(), '.local', 'bin', 'folio-nas-mount'));
}

export function getReorgMigrationMountPath(): string | null {
	const configured = process.env.FOLIO_REORG_MIGRATION_ROOT?.trim();
	return configured ? absoluteConfiguredPath(configured, configured) : null;
}

function expectedMigrationUsername(): string {
	const username = process.env.FOLIO_REORG_MIGRATION_USERNAME?.trim();
	if (!username) throw new Error('Für den einmaligen Migrationslauf fehlt FOLIO_REORG_MIGRATION_USERNAME.');
	return username.toLocaleLowerCase('en-US');
}

function mountOutput(): string {
	return execFileSync('/sbin/mount', [], { encoding: 'utf8', timeout: 10_000 });
}

function parseMountLine(root: string, output: string): { source: string; filesystem: string; options: string[] } | null {
	const marker = ` on ${root} (`;
	const line = output.split('\n').find((entry) => entry.includes(marker));
	if (!line) return null;
	const source = line.slice(0, line.indexOf(marker));
	const optionText = line.slice(line.indexOf(marker) + marker.length, line.endsWith(')') ? -1 : undefined);
	const options = optionText.split(',').map((entry) => entry.trim()).filter(Boolean);
	return { source, filesystem: options[0] ?? '', options };
}

function sourceUsername(source: string): string | null {
	return source.match(/^\/\/([^@/]+)@/)?.[1]?.toLocaleLowerCase('en-US') ?? null;
}

function expectedReadUsername(): string {
	return (process.env.FOLIO_NAS_READ_USERNAME?.trim() || 'folio-reader').toLocaleLowerCase('en-US');
}

function expectedWriteUsername(): string {
	return (process.env.FOLIO_NAS_WRITE_USERNAME?.trim() || 'folio-executor').toLocaleLowerCase('en-US');
}

export function inspectNasMount(path: string, options: InspectOptions = {}): NasMountStatus {
	const root = resolve(path);
	try {
		if (!existsSync(root)) return { root, mounted: false, mode: null, source: null, filesystem: null, writable: false, error: 'mountpoint_missing' };
		const stat = lstatSync(root);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			return { root, mounted: false, mode: null, source: null, filesystem: null, writable: false, error: 'unsafe_mountpoint' };
		}
		const mounted = parseMountLine(root, options.mountOutput ?? mountOutput());
		if (!mounted) return { root, mounted: false, mode: null, source: null, filesystem: null, writable: false, error: 'not_mounted' };
		const accountMatches = !options.expectedUsername
			|| sourceUsername(mounted.source) === options.expectedUsername.toLocaleLowerCase('en-US');
		const readOnly = mounted.options.includes('read-only') || Boolean(options.serverEnforcedReadOnly && accountMatches);
		let writable = false;
		if (!readOnly) {
			try {
				accessSync(root, constants.W_OK);
				writable = true;
			} catch {
				// The mount is not marked read-only, but this user cannot write.
			}
		}
		const accountMismatch = options.expectedUsername && !accountMatches;
		return {
			root,
			mounted: true,
			mode: readOnly ? 'read-only' : 'read-write',
			source: mounted.source,
			filesystem: mounted.filesystem,
			writable,
			error: mounted.filesystem !== 'smbfs' ? 'not_smbfs' : accountMismatch ? 'unexpected_account' : null
		};
	} catch (cause) {
		return {
			root, mounted: false, mode: null, source: null, filesystem: null, writable: false,
			error: cause instanceof Error ? cause.message : 'mount_inspection_failed'
		};
	}
}

function shareIdentity(source: string | null): string | null {
	if (!source) return null;
	return source.replace(/^\/\/[^@/]+@/, '//').toLocaleLowerCase('en-US');
}

export function sameNasShare(left: NasMountStatus, right: NasMountStatus): boolean | null {
	const leftIdentity = shareIdentity(left.source);
	const rightIdentity = shareIdentity(right.source);
	return leftIdentity && rightIdentity ? leftIdentity === rightIdentity : null;
}

export function inspectNasInfrastructure(options: { mountOutput?: string } = {}): NasInfrastructureStatus {
	const read = inspectNasMount(getNasReadMountPath(), { ...options, expectedUsername: expectedReadUsername(), serverEnforcedReadOnly: true });
	let write = inspectNasMount(getNasWriteMountPath(), { ...options, expectedUsername: expectedWriteUsername() });
	// Reader and executor deliberately share one native Finder volume. A healthy
	// reader therefore means that the mutually exclusive write channel is closed,
	// not that an unexpected-account write mount is open.
	if (read.root === write.root && read.mounted && read.mode === 'read-only' && !read.error) {
		write = {
			root: write.root,
			mounted: false,
			mode: null,
			source: null,
			filesystem: null,
			writable: false,
			error: null
		};
	}
	return {
		read,
		write,
		same_share: read.root === write.root ? true : sameNasShare(read, write),
		write_is_ephemeral: true
	};
}

export function requireNasMount(path: string, mode: NasMountMode, options: InspectOptions = {}): string {
	const status = inspectNasMount(path, options);
	if (!status.mounted) throw new Error(`NAS nicht bereit: ${status.root} ist nicht eingehängt (${status.error ?? 'unbekannt'}).`);
	if (status.error) throw new Error(`NAS nicht bereit: ${status.root} ist kein sicher erkannter SMB-Mount (${status.error}).`);
	if (status.mode !== mode) throw new Error(`NAS nicht bereit: ${status.root} ist ${status.mode ?? 'unbekannt'}, erwartet wird ${mode}.`);
	if (mode === 'read-write' && !status.writable) throw new Error(`NAS nicht bereit: ${status.root} ist für Folio nicht schreibbar.`);
	return realpathSync(status.root);
}

export function requireNasReadRoot(options: InspectOptions = {}): string {
	return requireNasReadRootAt(getNasReadMountPath(), options);
}

/** Verify a caller-supplied reader mount with the same Synology ACL contract. */
export function requireNasReadRootAt(path: string, options: InspectOptions = {}): string {
	return requireNasMount(path, 'read-only', {
		...options, expectedUsername: expectedReadUsername(), serverEnforcedReadOnly: true
	});
}

/**
 * Resolve the source for the one-time Reorg campaign. The normal path keeps the
 * dedicated server-enforced reader contract. An explicitly configured migration
 * source may be a read-write SMB mount because the campaign workers themselves
 * only read; any later move still requires a separately frozen execution plan.
 */
export function requireReorgCampaignSource(options: InspectOptions = {}): ReorgCampaignSource {
	const migrationRoot = getReorgMigrationMountPath();
	if (!migrationRoot) return { root: requireNasReadRoot(options), mode: 'dedicated-reader' };
	return requireReorgCampaignSourceAt(migrationRoot, 'one-time-migration', options);
}

export function requireReorgCampaignSourceAt(
	path: string,
	mode: ReorgCampaignSourceMode,
	options: InspectOptions = {}
): ReorgCampaignSource {
	if (mode === 'dedicated-reader') {
		return { root: requireNasReadRootAt(path, options), mode };
	}
	if (mode === 'one-time-read-only') {
		const status = inspectNasMount(path, options);
		if (!status.mounted) throw new Error(`NAS nicht bereit: ${status.root} ist nicht eingehängt (${status.error ?? 'unbekannt'}).`);
		if (status.error) throw new Error(`NAS nicht bereit: ${status.root} ist kein sicher erkannter SMB-Mount (${status.error}).`);
		if (status.mode !== 'read-only' || status.writable) {
			throw new Error('Die einmalige Reorg-Lesequelle ist nicht strikt read-only eingehängt.');
		}
		try {
			accessSync(status.root, constants.R_OK);
		} catch {
			throw new Error(`NAS nicht bereit: ${status.root} ist für die einmalige Inventur nicht lesbar.`);
		}
		return { root: realpathSync(status.root), mode };
	}
	const configured = getReorgMigrationMountPath();
	if (!configured || resolve(path) !== configured) {
		throw new Error('Die Inventur gehört nicht zur ausdrücklich konfigurierten einmaligen Migrationsquelle.');
	}
	const status = inspectNasMount(path, { ...options, expectedUsername: expectedMigrationUsername() });
	if (!status.mounted) throw new Error(`NAS nicht bereit: ${status.root} ist nicht eingehängt (${status.error ?? 'unbekannt'}).`);
	if (status.error) throw new Error(`NAS nicht bereit: ${status.root} ist kein sicher erkannter SMB-Mount (${status.error}).`);
	try {
		accessSync(status.root, constants.R_OK);
	} catch {
		throw new Error(`NAS nicht bereit: ${status.root} ist für die einmalige Inventur nicht lesbar.`);
	}
	return { root: realpathSync(status.root), mode };
}

/**
 * Verify the explicitly configured one-time migration source for the short
 * rename window. Unlike the normal reader/executor pair this does not mount or
 * switch accounts: it only accepts the exact configured SMB root, account and
 * a genuinely writable mount.
 */
export function requireReorgMigrationWriteRoot(options: InspectOptions = {}): string {
	const configured = getReorgMigrationMountPath();
	if (!configured) throw new Error('Für den einmaligen Migrationslauf fehlt FOLIO_REORG_MIGRATION_ROOT.');
	const status = inspectNasMount(configured, { ...options, expectedUsername: expectedMigrationUsername() });
	if (!status.mounted) throw new Error(`NAS nicht bereit: ${status.root} ist nicht eingehängt (${status.error ?? 'unbekannt'}).`);
	if (status.error) throw new Error(`NAS nicht bereit: ${status.root} ist kein sicher erkannter SMB-Mount (${status.error}).`);
	if (status.mode !== 'read-write' || !status.writable) {
		throw new Error('Die ausdrücklich konfigurierte Migrationsquelle ist nicht schreibbar. Der Batch wurde nicht verändert.');
	}
	return realpathSync(status.root);
}

export function requireNasWriteRoot(options: InspectOptions = {}): string {
	const write = inspectNasMount(getNasWriteMountPath(), { ...options, expectedUsername: expectedWriteUsername() });
	if (!write.mounted || write.mode !== 'read-write' || !write.writable || write.error) {
		throw new Error('Der kurzlebige Schreibkanal zum NAS ist nicht bereit. Der Batch wurde nicht verändert.');
	}
	return realpathSync(write.root);
}

/**
 * Opens the separate write mount only for the duration of an approved action.
 * The callback receives the verified write root. Agents never receive this path.
 */
export function withNasWriteMount<T>(action: (writeRoot: string) => T): T {
	const beforeRead = inspectNasMount(getNasReadMountPath(), {
		expectedUsername: expectedReadUsername(), serverEnforcedReadOnly: true
	});
	if (!beforeRead.mounted || beforeRead.mode !== 'read-only' || beforeRead.error) {
		throw new Error('Der dauerhafte read-only NAS-Mount ist nicht gesund. Die Ausführung wurde verweigert.');
	}

	const helper = getNasMountHelperPath();
	if (!existsSync(helper)) {
		throw new Error(`Der NAS-Mount-Helfer fehlt: ${helper}. Bitte die einmalige NAS-Einrichtung ausführen.`);
	}
	try {
		execFileSync(helper, ['open-write'], { encoding: 'utf8', timeout: 45_000, stdio: ['ignore', 'pipe', 'pipe'] });
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : 'unbekannter Mount-Fehler';
		throw new Error(`Der kurzlebige NAS-Schreibkanal konnte nicht geöffnet werden: ${detail}`);
	}

	let actionError: unknown = null;
	try {
		const write = inspectNasMount(getNasWriteMountPath(), { expectedUsername: expectedWriteUsername() });
		if (!sameNasShare(beforeRead, write)) {
			throw new Error('Der Executor wurde nicht auf derselben NAS-Freigabe wie der geprüfte Reader geöffnet.');
		}
		return action(requireNasWriteRoot());
	} catch (cause) {
		actionError = cause;
		throw cause;
	} finally {
		try {
			execFileSync(getNasMountHelperPath(), ['close-write'], {
				encoding: 'utf8', timeout: 45_000, stdio: ['ignore', 'pipe', 'pipe']
			});
		} catch (closeCause) {
			if (!actionError) {
				const detail = closeCause instanceof Error ? closeCause.message : 'unbekannter Unmount-Fehler';
				throw new Error(`Der Batch wurde beendet, aber der NAS-Reader konnte nicht wiederhergestellt werden: ${detail}`);
			}
		}
	}
}
