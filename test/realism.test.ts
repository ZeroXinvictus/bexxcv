import { describe, expect, it } from "vitest";
import { isBrowserLanguage } from "../src/locale.js";
import {
	coherentDprWeights,
	isKnownPhysical,
	languageList,
	realismDefaults,
	reconcileWebglKeys,
	snapScreen,
} from "../src/realism.js";

const WINDOWS_POOL: [number, number][] = [
	[1, 45],
	[1.25, 20],
	[1.5, 20],
	[2, 15],
];

describe("snapScreen", () => {
	it("moves an impossible screen to a plausible one and keeps window offsets", () => {
		const config: Record<string, unknown> = {
			"screen.width": 2176,
			"screen.height": 1224,
			"screen.availWidth": 2176,
			"screen.availHeight": 1184,
			"window.outerWidth": 2190,
			"window.outerHeight": 1190,
			"window.innerWidth": 2190,
			"window.innerHeight": 1139,
		};
		expect(snapScreen(config, WINDOWS_POOL)).toBe(true);
		const width = config["screen.width"] as number;
		const height = config["screen.height"] as number;
		expect(WINDOWS_POOL.some(([dpr]) => isKnownPhysical(width * dpr, height * dpr))).toBe(true);
		expect((config["window.outerWidth"] as number) - width).toBe(14);
		expect(height - (config["screen.availHeight"] as number)).toBe(40);
	});

	it("leaves a plausible screen untouched", () => {
		const config: Record<string, unknown> = { "screen.width": 1920, "screen.height": 1080 };
		expect(snapScreen(config, WINDOWS_POOL)).toBe(false);
		expect(config["screen.width"]).toBe(1920);
	});

	it("ignores a config without screen values", () => {
		expect(snapScreen({}, WINDOWS_POOL)).toBe(false);
	});
});

describe("coherentDprWeights", () => {
	it("gives implausible physical resolutions a tiny weight", () => {
		const [values, weights] = coherentDprWeights(WINDOWS_POOL, 1680, 1050);
		const at = (dpr: number) => weights[values.indexOf(dpr)]!;
		expect(at(1)).toBeGreaterThan(at(1.25) * 10);
	});
});

describe("languageList", () => {
	it("adds English fallbacks for other languages", () => {
		expect(languageList("id", "ID")).toBe("id-ID, id, en-US, en");
	});

	it("keeps English lists short", () => {
		expect(languageList("en", "GB")).toBe("en-GB, en");
	});
});

describe("isBrowserLanguage", () => {
	it("accepts common browser languages", () => {
		for (const tag of ["id", "en", "de", "fil", "zh_Hans"]) {
			expect(isBrowserLanguage(tag)).toBe(true);
		}
	});

	it("rejects rare regional languages", () => {
		for (const tag of ["jv", "su", "nij", "mad", "min", "gsw"]) {
			expect(isBrowserLanguage(tag)).toBe(false);
		}
	});
});

describe("realismDefaults", () => {
	it("fills only supported properties", () => {
		const known = {
			"mediaDevices:enabled": "bool",
			"mediaDevices:micros": "uint",
		};
		expect(realismDefaults(known)).toEqual({
			"mediaDevices:enabled": true,
			"mediaDevices:micros": 1,
		});
		expect(realismDefaults({})).toEqual({});
	});
});

describe("reconcileWebglKeys", () => {
	it("maps alias names to the ones the browser knows", () => {
		const known = { "webGl:vendor": "str", "webGl:renderer": "str" };
		expect(reconcileWebglKeys({ webglVendor: "A", webglRenderer: "B" }, known)).toEqual({
			"webGl:vendor": "A",
			"webGl:renderer": "B",
		});
	});

	it("throws for keys the browser does not know", () => {
		expect(() => reconcileWebglKeys({ mystery: 1 }, { "webGl:vendor": "str" })).toThrow();
	});
});
