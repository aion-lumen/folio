// Pure helper: map a numeric series to an SVG polyline `points` string inside a width×height box.
// No dependency, no chart library (Leuchtfeuer uses inline SVG only). Client- and server-safe.
export function sparklinePoints(
	series: number[],
	width: number,
	height: number,
	pad = 1
): string {
	if (series.length === 0) return '';
	if (series.length === 1) {
		const y = (height / 2).toFixed(1);
		return `${pad},${y} ${width - pad},${y}`;
	}
	const max = Math.max(...series);
	const min = Math.min(...series, 0);
	const range = max - min || 1;
	const step = (width - 2 * pad) / (series.length - 1);
	return series
		.map((v, i) => {
			const x = pad + i * step;
			const y = height - pad - ((v - min) / range) * (height - 2 * pad);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(' ');
}

/** Last n elements of a series (for the 7-day view over a 30-day series). */
export function lastN(series: number[], n: number): number[] {
	return series.slice(-n);
}
