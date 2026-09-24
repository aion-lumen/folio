import type { MemoryFactRow, MemorySensitivity } from '../memory/types.js';
import type { OrientationSourceEvidence } from './sources.js';

export interface DomainOrientationQuestion {
	id: string;
	domain: string;
	dimension: string;
	question: string;
	subject: string;
	data_class: string;
	predicate: string;
	default_sensitivity: MemorySensitivity;
	signals: string[];
}

export interface DomainCoverage {
	domain: string;
	label: string;
	evidence_count: number;
	confirmed_dimensions: number;
	sourced_dimensions: number;
	total_dimensions: number;
	questions: Array<DomainOrientationQuestion & { answered: boolean; source_evidence: OrientationSourceEvidence[] }>;
}

const BLUEPRINTS: Array<{ domain: string; label: string; questions: Omit<DomainOrientationQuestion, 'domain'>[] }> = [
	{
		domain: 'career', label: 'Karriere', questions: [
			q('career-direction', 'Richtung', 'Welches berufliche Ziel hat in den nächsten zwölf Monaten Vorrang?', 'Berufliche Ausrichtung', 'direction', 'has_direction', 'private'),
			q('career-constraints', 'Rahmen', 'Welche Rahmenbedingungen sind nicht verhandelbar – Ort, Pensum, Einkommen oder Arbeitsform?', 'Berufliche Rahmenbedingungen', 'constraints', 'has_constraints', 'private'),
			q('career-strengths', 'Stärken', 'Welche Erfahrungen und Fähigkeiten sollen bei Entscheidungen besonders gewichtet werden?', 'Berufliches Profil', 'profile', 'has_strength', 'private'),
			q('career-priority', 'Priorität', 'Welche Bewerbungen, Gespräche oder Sichtbarkeitsvorhaben haben aktuell Vorrang?', 'Aktuelle Karrierepriorität', 'priority', 'has_priority', 'private'),
			q('career-decision-rule', 'Entscheidung', 'Nach welchen Kriterien vergleichst du konkrete Stellen oder Mandate?', 'Karriere-Entscheidungsregel', 'decision', 'follows_decision_rule', 'private')
		]
	},
	{
		domain: 'finance', label: 'Finanzen', questions: [
			q('finance-goal', 'Ziel', 'Welche finanziellen Ziele bestimmen derzeit deine Entscheidungen?', 'Finanzielle Ziele', 'goal', 'has_goal', 'sensitive'),
			q('finance-obligations', 'Pflichten', 'Welche wiederkehrenden Verpflichtungen und Fristen müssen zuverlässig berücksichtigt werden?', 'Finanzielle Verpflichtungen', 'obligation', 'has_obligation', 'sensitive'),
			q('finance-boundary', 'Spielraum', 'Welche Ausgaben- oder Liquiditätsgrenzen sollen Entscheidungen leiten?', 'Finanzieller Spielraum', 'constraint', 'has_constraints', 'sensitive'),
			q('finance-risk', 'Risiko', 'Welche finanziellen Risiken sollen früh erkannt oder vermieden werden?', 'Finanzielle Risikoregeln', 'decision', 'follows_risk_rule', 'sensitive'),
			q('finance-priority', 'Priorität', 'Welche finanziellen Themen benötigen in den nächsten Wochen Aufmerksamkeit?', 'Aktuelle Finanzpriorität', 'priority', 'has_priority', 'sensitive')
		]
	},
	{
		domain: 'personal', label: 'Persönlich', questions: [
			q('personal-people', 'Menschen', 'Welche Menschen und Verantwortlichkeiten müssen bei Entscheidungen mitgedacht werden?', 'Persönliches Umfeld', 'context', 'has_people_context', 'sensitive'),
			q('personal-commitments', 'Verpflichtungen', 'Welche laufenden Verpflichtungen prägen deinen verfügbaren Spielraum?', 'Persönliche Verpflichtungen', 'obligation', 'has_obligation', 'private'),
			q('personal-time', 'Zeit', 'Welche Zeitgrenzen, Routinen oder wiederkehrenden Termine sind wichtig?', 'Persönlicher Zeitrahmen', 'constraint', 'has_time_constraint', 'private'),
			q('personal-priority', 'Priorität', 'Was soll im Alltag derzeit geschützt oder bewusst gestärkt werden?', 'Persönliche Priorität', 'priority', 'has_priority', 'private'),
			q('personal-decision-rule', 'Abwägung', 'Welche persönlichen Kriterien sollen bei domänenübergreifenden Entscheidungen nie untergehen?', 'Persönliche Entscheidungsregel', 'decision', 'follows_decision_rule', 'private')
		]
	},
	{
		domain: 'ai', label: 'AI & Folio', questions: [
			q('ai-goal', 'Ziel', 'Welches Ergebnis soll deine AI-Arbeit in den nächsten Monaten erzeugen?', 'AI-Zielbild', 'goal', 'has_goal', 'private'),
			q('ai-projects', 'Vorhaben', 'Welche Projekte und Module sind aktiv, und welches davon hat Vorrang?', 'Aktive AI-Vorhaben', 'priority', 'has_priority', 'private'),
			q('ai-audience', 'Adressaten', 'Für wen baust und veröffentlichst du – Nutzer, Arbeitgeber, Community oder Partner?', 'Adressaten', 'audience', 'has_audience', 'private'),
			q('ai-principles', 'Prinzipien', 'Welche technischen und ethischen Prinzipien dürfen beim Ausbau nicht erodieren?', 'AI-Prinzipien', 'decision', 'follows_principle', 'public'),
			q('ai-narrative', 'Öffentlichkeit', 'Welche überprüfbare Geschichte sollen die öffentlichen Artefakte gemeinsam erzählen?', 'Öffentliche Erzählung', 'voice_rule', 'follows_voice_rule', 'public')
		]
	},
	{
		domain: 'health', label: 'Gesundheit', questions: [
			q('health-goal', 'Ziel', 'Welche gesundheitlichen Ziele oder Stabilitätskriterien sind aktuell wichtig?', 'Gesundheitliche Ziele', 'goal', 'has_goal', 'sensitive'),
			q('health-routine', 'Routine', 'Welche Routinen, Behandlungen oder Kontrollen müssen berücksichtigt werden?', 'Gesundheitsroutine', 'routine', 'has_routine', 'sensitive'),
			q('health-contacts', 'Ansprechpersonen', 'Welche medizinischen oder therapeutischen Ansprechpersonen sind relevant?', 'Gesundheitskontakte', 'contact_fact', 'has_contact', 'sensitive'),
			q('health-constraints', 'Grenzen', 'Welche gesundheitlichen Grenzen beeinflussen Termine, Arbeit oder Reisen?', 'Gesundheitliche Grenzen', 'constraint', 'has_constraints', 'sensitive')
		]
	},
	{
		domain: 'immo', label: 'Immobilien', questions: [
			q('immo-goal', 'Ziel', 'Welches konkrete Immobilienziel wird verfolgt?', 'Immobilienziel', 'goal', 'has_goal', 'private'),
			q('immo-criteria', 'Kriterien', 'Welche Lage-, Objekt- und Ausschlusskriterien gelten?', 'Immobilienkriterien', 'preference', 'has_search_criteria', 'private'),
			q('immo-budget', 'Budget', 'Welche Budget- und Finanzierungsgrenzen sind maßgeblich?', 'Immobilienbudget', 'constraint', 'has_budget_constraint', 'sensitive'),
			q('immo-timing', 'Zeit', 'Welche Fristen oder zeitlichen Erwartungen bestehen?', 'Immobilienzeitplan', 'constraint', 'has_time_constraint', 'private')
		]
	},
	{
		domain: 'infrastructure', label: 'Infrastruktur & Ordnung', questions: [
			q('infrastructure-goal', 'Zielbild', 'Wie soll deine persönliche und familiäre Infrastruktur im Zielzustand funktionieren?', 'Infrastruktur-Zielbild', 'goal', 'has_goal', 'sensitive'),
			q('infrastructure-inbox', 'Eingang', 'Welche Eingänge sollen ohne Nachdenken gesammelt und später eingeordnet werden?', 'Infrastruktur-Eingänge', 'context', 'has_inbox_model', 'private'),
			q('infrastructure-inventory', 'Bestand', 'Welche Geräte, Konten, Speicherorte und Dienste müssen als Bestand erfasst bleiben?', 'Infrastruktur-Bestand', 'inventory', 'has_inventory_scope', 'sensitive'),
			q('infrastructure-boundary', 'Grenzen', 'Welche Sicherungs-, Zugriffs- und Aufbewahrungsregeln sind nicht verhandelbar?', 'Infrastruktur-Grenzen', 'constraint', 'has_constraints', 'sensitive'),
			q('infrastructure-automation', 'Automatisierung', 'Welche wiederkehrenden Aufräumarbeiten darf Folio nur vorschlagen, und welche später selbst ausführen?', 'Automatisierungsgrenzen', 'decision', 'follows_automation_rule', 'sensitive')
		]
	}
];

function q(
	id: string,
	dimension: string,
	question: string,
	subject: string,
	data_class: string,
	predicate: string,
	default_sensitivity: MemorySensitivity,
	signals: string[] = []
): Omit<DomainOrientationQuestion, 'domain'> {
	return { id, dimension, question, subject, data_class, predicate, default_sensitivity, signals: [predicate, ...signals] };
}

export function listOrientationQuestions(): DomainOrientationQuestion[] {
	return BLUEPRINTS.flatMap((blueprint) => blueprint.questions.map((question) => ({ ...question, domain: blueprint.domain })));
}

export function getOrientationQuestion(id: string): DomainOrientationQuestion | null {
	return listOrientationQuestions().find((question) => question.id === id) ?? null;
}

function isAnswered(question: DomainOrientationQuestion, facts: MemoryFactRow[]): boolean {
	return facts.some((fact) =>
		fact.domain === question.domain &&
		fact.status === 'confirmed' &&
		(question.signals.includes(fact.predicate) || question.signals.includes(fact.data_class))
	);
}

export function buildDomainCoverage(facts: MemoryFactRow[], sourceEvidence: OrientationSourceEvidence[] = []): DomainCoverage[] {
	const confirmed = facts.filter((fact) => fact.status === 'confirmed');
	const knownDomains = new Set(BLUEPRINTS.map((blueprint) => blueprint.domain));
	const coverage = BLUEPRINTS.map((blueprint): DomainCoverage => {
		const domainFacts = confirmed.filter((fact) => fact.domain === blueprint.domain);
		const questions = blueprint.questions.map((question) => {
			const full = { ...question, domain: blueprint.domain };
			return {
				...full,
				answered: isAnswered(full, domainFacts),
				source_evidence: sourceEvidence.filter((row) => row.question_id === full.id)
			};
		});
		return {
			domain: blueprint.domain,
			label: blueprint.label,
			evidence_count: domainFacts.length,
			confirmed_dimensions: questions.filter((question) => question.answered).length,
			sourced_dimensions: questions.filter((question) => !question.answered && question.source_evidence.length > 0).length,
			total_dimensions: questions.length,
			questions
		};
	});
	for (const domain of [...new Set(confirmed.map((fact) => fact.domain))].filter((domain) => !knownDomains.has(domain)).sort()) {
		coverage.push({
			domain,
			label: domain,
			evidence_count: confirmed.filter((fact) => fact.domain === domain).length,
			confirmed_dimensions: 0,
			sourced_dimensions: 0,
			total_dimensions: 0,
			questions: []
		});
	}
	return coverage.sort((a, b) => b.evidence_count - a.evidence_count || a.label.localeCompare(b.label));
}

export function renderCoverageForHermes(coverage: DomainCoverage[]): string {
	return `## Offene Orientierungsfelder\n${coverage.map((domain) => {
		const missing = domain.questions.filter((question) => !question.answered).map((question) => question.dimension).join(', ');
		return `- ${domain.label}: ${domain.confirmed_dimensions}/${domain.total_dimensions || '–'} Felder belegt; ${domain.evidence_count} bestätigte Fakten; offen: ${missing || 'kein definierter Fragenkatalog'}`;
	}).join('\n')}\n\nDie Kennzahl misst nur beantwortete Orientierungsfragen, nicht Wahrheit oder objektive Vollständigkeit.`;
}
