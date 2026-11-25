import { UnknownProperty } from "./exceptions.js";

const KNOWN_PHYSICAL = new Set([
	"1280x720",
	"1280x800",
	"1366x768",
	"1440x900",
	"1536x864",
	"1600x900",
	"1680x1050",
	"1920x1080",
	"1920x1200",
	"2048x1152",
	"2256x1504",
	"2304x1440",
	"2560x1080",
	"2560x1440",
	"2560x1600",
	"2880x1620",
	"2880x1800",
	"2940x1912",
	"3000x2000",
	"3024x1964",
	"3440x1440",
	"3456x2234",
	"3840x2160",
	"3840x2400",
	"5120x1440",
	"5120x2880",
	"2400x1350",
	"3200x1800",
	"2304x1296",
	"3072x1728",
	"4096x2304",
	"2000x1125",
	"2160x1350",
	"3840x1080",
]);

export function isKnownPhysical(width: number, height: number): boolean {
	return KNOWN_PHYSICAL.has(`${Math.round(width)}x${Math.round(height)}`);
}

export function coherentDprWeights(
	pool: [number, number][],
	width: number,
	height: number,
): [number[], number[]] {
	const values = pool.map(([value]) => value);
	const weights = pool.map(([value, weight]) =>
		isKnownPhysical(width * value, height * value) ? weight : weight * 0.02,
	);
	return [values, weights];
}

const WEBGL_ALIASES: [string, string][] = [
	["webglVendor", "webGl:vendor"],
	["webglRenderer", "webGl:renderer"],
];

export function reconcileWebglKeys(
	data: Record<string, unknown>,
	known: Record<string, string>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		if (known[key]) {
			out[key] = value;
			continue;
		}
		const pair = WEBGL_ALIASES.find(([a, b]) => a === key || b === key);
		const other = pair ? (pair[0] === key ? pair[1] : pair[0]) : null;
		if (other && known[other]) {
			out[other] = value;
			continue;
		}
		throw new UnknownProperty(
			`WebGL data key "${key}" is not supported by the installed Camoufox build. The webgl_data.db in use does not match this browser version. Run "npx bexxcv doctor" for details.`,
		);
	}
	return out;
}

export const REALISM_PROPERTIES = [
	"mediaDevices:enabled",
	"mediaDevices:micros",
	"mediaDevices:webcams",
	"mediaDevices:speakers",
];

export function realismDefaults(known: Record<string, string>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (known["mediaDevices:enabled"] === "bool") out["mediaDevices:enabled"] = true;
	for (const key of ["mediaDevices:micros", "mediaDevices:webcams", "mediaDevices:speakers"]) {
		if (known[key] === "int" || known[key] === "uint") out[key] = 1;
	}
	return out;
}

const COMMON_SCREENS: [number, number][] = [
	[1920, 1080],
	[1536, 864],
	[1366, 768],
	[1440, 900],
	[1600, 900],
	[1280, 720],
	[1680, 1050],
	[2560, 1440],
	[1920, 1200],
	[1280, 800],
	[1470, 956],
	[1512, 982],
	[1728, 1117],
	[2048, 1152],
	[1792, 1120],
];

const WIDTH_KEYS = ["screen.width", "screen.availWidth", "window.outerWidth", "window.innerWidth"];
const HEIGHT_KEYS = ["screen.height", "screen.availHeight", "window.outerHeight", "window.innerHeight"];

function shift(config: Record<string, unknown>, key: string, delta: number): void {
	const value = config[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		config[key] = Math.max(1, Math.round(value + delta));
	}
}

export function snapScreen(
	config: Record<string, unknown>,
	pool: [number, number][],
): boolean {
	const width = Number(config["screen.width"]);
	const height = Number(config["screen.height"]);
	if (!(width > 0 && height > 0)) return false;

	const totalWeight = pool.reduce((acc, [, w]) => acc + w, 0);
	const scoreFor = (w: number, h: number): number => {
		let score = 0;
		for (const [dpr, weight] of pool) {
			if (isKnownPhysical(w * dpr, h * dpr)) score += weight;
		}
		return score;
	};

	const currentScore = scoreFor(width, height);
	if (currentScore >= totalWeight * 0.999) return false;

	let best: [number, number] | null = null;
	let bestScore = currentScore;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const [w, h] of COMMON_SCREENS) {
		const score = scoreFor(w, h);
		if (score < bestScore) continue;
		const distance = Math.hypot(w - width, h - height);
		if (score > bestScore || distance < bestDistance) {
			bestScore = score;
			bestDistance = distance;
			best = [w, h];
		}
	}
	if (!best || (best[0] === width && best[1] === height)) return false;

	const dw = best[0] - width;
	const dh = best[1] - height;
	for (const key of WIDTH_KEYS) shift(config, key, dw);
	for (const key of HEIGHT_KEYS) shift(config, key, dh);
	return true;
}

export function languageList(language: string, region: string): string {
	if (language === "en") return `en-${region}, en`;
	return `${language}-${region}, ${language}, en-US, en`;
}
