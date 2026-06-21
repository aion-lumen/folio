// Bug-fix 2026-05-25 — Direktive bugs-links-distanz Block 2.
// Token-basiertes Linkify für untrusted Mail-Body-Content.
//
// Security:
//   - Returnt typed segments (text vs link), KEIN raw HTML — Svelte auto-escape
//     greift im Template, sodass kein HTML-Injection möglich ist.
//   - Anrufer rendert die `link`-segments als <a href={seg.value} target="_blank"
//     rel="noopener noreferrer">{seg.value}</a> — kein Linktext-Maskieren.

export type Segment = { type: 'text'; value: string } | { type: 'link'; value: string };

// URL bis whitespace/quote/bracket. Schliesst typische trailing-punctuation
// (Komma/Punkt/Semikolon/Klammer) AUS — sie gehört oft nicht zur URL.
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;

// Strip trailing punctuation, das wahrscheinlich Satz-Marker ist, nicht URL-Teil.
const TRAILING_PUNCT = /[.,;:!?)\]}>]+$/;

export function linkify(text: string): Segment[] {
	if (!text) return [{ type: 'text', value: '' }];

	const segments: Segment[] = [];
	let lastIdx = 0;

	for (const match of text.matchAll(URL_RE)) {
		const idx = match.index ?? 0;
		const raw = match[0];

		// Trailing punctuation strip — addiere abgeschnittene zurück als text-segment.
		const trimMatch = raw.match(TRAILING_PUNCT);
		const url = trimMatch ? raw.slice(0, -trimMatch[0].length) : raw;
		const trailing = trimMatch ? trimMatch[0] : '';

		// Text vor dem Match
		if (idx > lastIdx) {
			segments.push({ type: 'text', value: text.slice(lastIdx, idx) });
		}
		// URL
		segments.push({ type: 'link', value: url });
		// Trailing punctuation als text (separat, damit Komma/Punkt klar als Text bleibt)
		if (trailing) {
			segments.push({ type: 'text', value: trailing });
		}
		lastIdx = idx + raw.length;
	}

	// Rest-Text nach letztem Match
	if (lastIdx < text.length) {
		segments.push({ type: 'text', value: text.slice(lastIdx) });
	}

	// Edge case: keine URLs → ein einziges text-segment
	if (segments.length === 0) {
		return [{ type: 'text', value: text }];
	}

	return segments;
}
