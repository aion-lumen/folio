/** Portal-Key → kurze Display-Domain (B9 „auch auf"-Pille + B14 Provenance). */
export function shortPortal(portalKey: string): string {
	const map: Record<string, string> = {
		immoscout_de_grenzregion: 'immoscout24.de',
		immoscout_ch_basel: 'immoscout24.ch',
		immoscout_ch: 'immoscout24.ch',
		immowelt_grenzregion: 'immowelt.de',
		homegate_basel: 'homegate.ch',
		homegate: 'homegate.ch',
		comparis_basel: 'comparis.ch'
	};
	return map[portalKey] ?? portalKey;
}
