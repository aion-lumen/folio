const MONTHS: Record<string, number> = {
	january:1, januarys:1, jan:1, januar:1, february:2, feb:2, februar:2, march:3, mar:3, märz:3, maerz:3,
	april:4, apr:4, may:5, mai:5, june:6, jun:6, juni:6, july:7, jul:7, juli:7, august:8, aug:8,
	september:9, sep:9, sept:9, october:10, oct:10, oktober:10, okt:10, november:11, nov:11,
	december:12, dec:12, dezember:12, dez:12
};

function iso(year: number, month: number, date: number) {
	const value = `${year}-${String(month).padStart(2,'0')}-${String(date).padStart(2,'0')}`;
	const parsed = Date.parse(value+'T12:00:00Z');
	return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10) === value ? value : null;
}

/** Prefer an explicit date in the evidence text over occasionally stale extraction metadata. */
export function sourceDateSpan(source: { value_text: string; valid_from: string | null }): { start:string; end:string|null } | null {
	const text = source.value_text;
	const fullRange = text.match(/(\d{4})-(\d{2})-(\d{2})\s*(?:bis|to|through|[-–—/])\s*(?:(\d{4})-(\d{2})-)?(\d{2})/i);
	if (fullRange) {
		const start = iso(+fullRange[1],+fullRange[2],+fullRange[3]);
		const end = iso(+(fullRange[4]??fullRange[1]),+(fullRange[5]??fullRange[2]),+fullRange[6]);
		if (start && end) return {start,end};
	}
	const slashRange = text.match(/(\d{4})-(\d{2})-(\d{2})\s*\/\s*(\d{1,2})/);
	if (slashRange) {
		const start=iso(+slashRange[1],+slashRange[2],+slashRange[3]),end=iso(+slashRange[1],+slashRange[2],+slashRange[4]);
		if(start&&end)return {start,end};
	}
	const namedRange = text.match(/\b(\d{1,2})(?:st|nd|rd|th|\.)?\s*(?:bis|to|through|[-–—])\s*(\d{1,2})(?:st|nd|rd|th|\.)?\s+(january|jan(?:uar)?|february|feb(?:ruar)?|march|mar|märz|maerz|april|apr|may|mai|june|jun(?:i)?|july|jul(?:i)?|august|aug|september|sept?|october|oct|oktober|okt|november|nov|december|dec|dezember|dez)\s+(\d{4})\b/i);
	if (namedRange) {
		const month=MONTHS[namedRange[3].toLowerCase()],start=iso(+namedRange[4],month,+namedRange[1]),end=iso(+namedRange[4],month,+namedRange[2]);
		if(start&&end)return {start,end};
	}
	const singleIso = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
	if (singleIso) {
		const date = iso(+singleIso.slice(0,4), +singleIso.slice(5,7), +singleIso.slice(8,10));
		return date ? {start:date,end:null} : null;
	}
	const dotted = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
	if (dotted) { const date=iso(+dotted[3],+dotted[2],+dotted[1]); return date?{start:date,end:null}:null; }
	const named = text.match(/\b(\d{1,2})(?:st|nd|rd|th|\.)?\s+(january|jan(?:uar)?|february|feb(?:ruar)?|march|mar|märz|maerz|april|apr|may|mai|june|jun(?:i)?|july|jul(?:i)?|august|aug|september|sept?|october|oct|oktober|okt|november|nov|december|dec|dezember|dez)\s+(\d{4})\b/i);
	if (named) { const date=iso(+named[3],MONTHS[named[2].toLowerCase()],+named[1]); if(date)return {start:date,end:null}; }
	const fallback=source.valid_from?.slice(0,10);
	const date = fallback && /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? iso(+fallback.slice(0,4),+fallback.slice(5,7),+fallback.slice(8,10)) : null;
	return date ? {start:date,end:null} : null;
}
