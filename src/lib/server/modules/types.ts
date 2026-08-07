export type ModuleCapabilityKind = 'read' | 'write' | 'execute' | 'render';
export type ModuleDatabaseAccess = 'read-only' | 'read-write';
export type ModuleSensitivity = 'aggregate' | 'private' | 'sensitive';

export interface ModuleCapability {
	id: string;
	kind: ModuleCapabilityKind;
	description: string;
}

export interface ModuleDataClass {
	id: string;
	sensitivity: ModuleSensitivity;
	retention: {
		policy: string;
		enforced: boolean;
	};
}

export interface ModulePanelField {
	id: string;
	label: string;
	data_class: string;
}

export interface ModulePanel {
	id: string;
	label: string;
	requires: string;
	fields: readonly ModulePanelField[];
}

export interface ModuleDatabase {
	id: string;
	engine: 'sqlite' | 'filesystem';
	access: ModuleDatabaseAccess;
	data_classes: readonly string[];
}

export interface ModuleManifest {
	schema: 'folio/module-manifest/v1';
	id: string;
	label: string;
	version: string;
	capabilities: readonly ModuleCapability[];
	data_classes: readonly ModuleDataClass[];
	panels: readonly ModulePanel[];
	databases: readonly ModuleDatabase[];
	kill_switch: {
		global_env: 'FOLIO_MODULES_DISABLED';
		module_env: 'FOLIO_DISABLED_MODULES';
	};
}

export interface ModuleRegistration {
	manifest: ModuleManifest;
	enabled: () => boolean;
	database_paths?: Readonly<Record<string, () => string | null>>;
}

export type ModuleAccessReason =
	| 'allowed'
	| 'unknown-module'
	| 'module-disabled'
	| 'kill-switch'
	| 'unknown-capability';

export interface ModuleAccess {
	allowed: boolean;
	reason: ModuleAccessReason;
}

export interface ModuleSnapshot {
	manifest: ModuleManifest;
	enabled: boolean;
	killed: boolean;
}
