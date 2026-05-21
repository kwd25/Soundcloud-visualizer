/**
 * Generate a palette of N visually distinct HSL colors using the
 * golden-angle increment trick. Returns CSS rgb strings (sigma.js prefers
 * those over named colors for performance).
 *
 * Saturation is kept high; lightness sits around 60% so colors pop against
 * the dark grey background but don't blow out.
 */
const GOLDEN_ANGLE_DEG = 137.508;

function hslToRgb(h: number, s: number, l: number): string {
	// h in [0, 360), s in [0, 1], l in [0, 1]
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const hPrime = h / 60;
	const x = c * (1 - Math.abs((hPrime % 2) - 1));
	let r = 0;
	let g = 0;
	let b = 0;
	if (hPrime < 1) [r, g, b] = [c, x, 0];
	else if (hPrime < 2) [r, g, b] = [x, c, 0];
	else if (hPrime < 3) [r, g, b] = [0, c, x];
	else if (hPrime < 4) [r, g, b] = [0, x, c];
	else if (hPrime < 5) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	const m = l - c / 2;
	const R = Math.round((r + m) * 255);
	const G = Math.round((g + m) * 255);
	const B = Math.round((b + m) * 255);
	return `rgb(${R}, ${G}, ${B})`;
}

const cache = new Map<number, string[]>();

export function communityPalette(count: number): string[] {
	if (count <= 0) return [];
	const hit = cache.get(count);
	if (hit) return hit;

	const colors: string[] = [];
	for (let i = 0; i < count; i++) {
		const hue = (i * GOLDEN_ANGLE_DEG) % 360;
		// Alternate lightness in two tiers so adjacent hues are also distinguishable.
		const lightness = i % 2 === 0 ? 0.65 : 0.55;
		colors.push(hslToRgb(hue, 0.7, lightness));
	}
	cache.set(count, colors);
	return colors;
}

/** Map a community id to a color, falling back to a neutral gray for null. */
export function colorForCommunity(
	communityId: number | null,
	palette: string[],
): string {
	if (communityId == null) return "rgb(150, 150, 160)";
	return palette[communityId % palette.length] ?? "rgb(150, 150, 160)";
}

/** Owner gets jade so they're always visible regardless of community. */
export const OWNER_NODE_COLOR = "rgb(120, 220, 180)"; // jade-ish

/** Highlight color for selected node — amethyst. */
export const SELECTION_COLOR = "rgb(195, 140, 230)";
