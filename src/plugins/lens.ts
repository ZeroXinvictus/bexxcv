import * as fs from "node:fs";
import * as path from "node:path";
import type { Page } from "playwright-core";
import { isKnownPhysical } from "../realism.js";
import type { BexxcvPlugin } from "./types.js";

export interface LensOptions {
	audit?: boolean;
	target?: "local";
	quiet?: boolean;
	out?: string;
}

export interface LensCheck {
	id: string;
	ok: boolean;
	detail: string;
}

export interface LensReport {
	score: number;
	checks: LensCheck[];
}

const REPORTS = new WeakMap<Page, LensReport>();
const AUDITED = new WeakSet<Page>();

export function lensReport(page: Page): LensReport | null {
	return REPORTS.get(page) ?? null;
}

interface Probe {
	ua: string;
	platform: string;
	language: string;
	languages: string[];
	intlLocale: string;
	cores: number;
	webdriver: boolean;
	touch: number;
	dpr: number;
	screenW: number;
	screenH: number;
	innerW: number;
	innerH: number;
	outerW: number;
	outerH: number;
	vendor: string | null;
	renderer: string | null;
	nativeCode: boolean;
	hasChrome: boolean;
	hasUaData: boolean;
	pdfViewer: boolean | null;
	focused: boolean;
	visible: boolean;
	mediaDevices: number | null;
	mediaTimeout: boolean;
	audioSampleRate: number | null;
	audioLatency: number | null;
	fontCount: number | null;
	fontLoadError: boolean | null;
	webglPrecisionHighpFloat: number | null;
	webglPrecisionLowpFloat: number | null;
	userAgentDataPlatform: string | null;
	clientHintsMobile: boolean | null;
}

const PLAUSIBLE_CORES = new Set([2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32]);

export async function auditFingerprint(page: Page): Promise<LensReport> {
	const probe = await page.evaluate(async (): Promise<Probe> => {
		let vendor: string | null = null;
		let renderer: string | null = null;
		try {
			const canvas = document.createElement("canvas");
			const gl = (canvas.getContext("webgl") ||
				canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
			if (gl) {
				const ext = gl.getExtension("WEBGL_debug_renderer_info");
				vendor = String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
				renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
			}
		} catch {
			vendor = null;
		}

		const natives: unknown[] = [
			navigator.permissions && navigator.permissions.query,
			HTMLCanvasElement.prototype.toDataURL,
			Date.prototype.getTimezoneOffset,
			Function.prototype.toString,
		];
		const nativeCode = natives.every(
			(fn) =>
				typeof fn !== "function" ||
				/\[native code\]/.test(Function.prototype.toString.call(fn)),
		);

		let mediaDevices: number | null = null;
		let mediaTimeout = false;
		try {
			if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
				const list = await Promise.race([
					navigator.mediaDevices.enumerateDevices(),
					new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
				]);
				mediaDevices = list ? list.length : null;
				mediaTimeout = list === null;
			}
		} catch {
			mediaDevices = null;
		}

		const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };

		// AudioContext sampling
		let audioSampleRate: number | null = null;
		let audioLatency: number | null = null;
		try {
			const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
			audioSampleRate = ac.sampleRate;
			audioLatency = typeof ac.outputLatency === "number" ? ac.outputLatency : null;
			ac.close();
		} catch {
			audioSampleRate = null;
		}

		// Font enumeration
		let fontCount: number | null = null;
		let fontLoadError: boolean | null = null;
		try {
			await document.fonts.ready;
			fontCount = document.fonts.size;
		} catch {
			fontLoadError = true;
			fontCount = null;
		}

		// WebGL shader precision
		let webglPrecisionHighpFloat: number | null = null;
		let webglPrecisionLowpFloat: number | null = null;
		try {
			const canvas2 = document.createElement("canvas");
			const gl2 = canvas2.getContext("webgl") as WebGLRenderingContext | null;
			if (gl2) {
				const fmt = gl2.getShaderPrecisionFormat(
					WebGLRenderingContext.FRAGMENT_SHADER,
					WebGLRenderingContext.HIGH_FLOAT,
				);
				if (fmt) webglPrecisionHighpFloat = fmt.precision;
				const fmtLow = gl2.getShaderPrecisionFormat(
					WebGLRenderingContext.FRAGMENT_SHADER,
					WebGLRenderingContext.LOW_FLOAT,
				);
				if (fmtLow) webglPrecisionLowpFloat = fmtLow.precision;
			}
		} catch {
			// WebGL unavailable — non-fatal
		}

		// Client Hints (userAgentData)
		const uad = (navigator as any).userAgentData;
		let userAgentDataPlatform: string | null = null;
		let clientHintsMobile: boolean | null = null;
		if (uad && typeof uad.getHighEntropyValues === "function") {
			try {
				const hints = await uad.getHighEntropyValues(["platform", "mobile"]);
				userAgentDataPlatform = hints.platform ?? null;
				clientHintsMobile = hints.mobile ?? null;
			} catch {
				// Permission denied or not available
			}
		} else if (uad && uad.platform) {
			userAgentDataPlatform = String(uad.platform);
			clientHintsMobile = Boolean(uad.mobile);
		}

		return {
			ua: navigator.userAgent,
			platform: navigator.platform,
			language: navigator.language,
			languages: Array.from(navigator.languages),
			intlLocale: Intl.DateTimeFormat().resolvedOptions().locale,
			cores: navigator.hardwareConcurrency,
			webdriver: navigator.webdriver === true,
			touch: navigator.maxTouchPoints,
			dpr: window.devicePixelRatio,
			screenW: screen.width,
			screenH: screen.height,
			innerW: window.innerWidth,
			innerH: window.innerHeight,
			outerW: window.outerWidth,
			outerH: window.outerHeight,
			vendor,
			renderer,
			nativeCode,
			hasChrome: "chrome" in window,
			hasUaData: "userAgentData" in navigator,
			pdfViewer: typeof nav.pdfViewerEnabled === "boolean" ? nav.pdfViewerEnabled : null,
			focused: document.hasFocus(),
			visible: document.visibilityState === "visible",
			mediaDevices,
			mediaTimeout,
			audioSampleRate,
			audioLatency,
			fontCount,
			fontLoadError,
			webglPrecisionHighpFloat,
			webglPrecisionLowpFloat,
			userAgentDataPlatform,
			clientHintsMobile,
		};
	});

	const checks: LensCheck[] = [];
	const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
	const firefox = /Firefox\//.test(probe.ua);
	const desktop = !/Android|Mobile|iPhone|iPad/i.test(probe.ua);

	add("webdriver", !probe.webdriver, `navigator.webdriver is ${probe.webdriver}`);

	const platformOk =
		(/Windows/i.test(probe.ua) && /^Win/i.test(probe.platform)) ||
		(/Macintosh|Mac OS/i.test(probe.ua) && /^Mac/i.test(probe.platform)) ||
		(/Linux|X11/i.test(probe.ua) && !/Windows|Macintosh/i.test(probe.ua) && /Linux|X11/i.test(probe.platform));
	add("ua-platform", platformOk, `${probe.platform} against the user agent`);

	add(
		"language",
		probe.languages[0] === probe.language,
		`language ${probe.language}, first of languages ${probe.languages[0]}`,
	);

	add(
		"locale-intl",
		probe.intlLocale.split("-")[0]!.toLowerCase() === probe.language.split("-")[0]!.toLowerCase(),
		`Intl locale ${probe.intlLocale}, navigator language ${probe.language}`,
	);

	add(
		"dpr-screen",
		isKnownPhysical(probe.screenW * probe.dpr, probe.screenH * probe.dpr),
		`${probe.screenW}x${probe.screenH} at DPR ${probe.dpr}`,
	);

	add(
		"window-size",
		probe.innerW <= probe.outerW && probe.innerH <= probe.outerH && probe.outerW <= probe.screenW + 16,
		`inner ${probe.innerW}x${probe.innerH}, outer ${probe.outerW}x${probe.outerH}, screen ${probe.screenW}x${probe.screenH}`,
	);

	add("cores", PLAUSIBLE_CORES.has(probe.cores), `${probe.cores} logical cores`);
	add("touch", !desktop || probe.touch === 0, `maxTouchPoints ${probe.touch}`);

	add(
		"webgl",
		probe.vendor !== null && probe.renderer !== null,
		probe.renderer ? `${probe.vendor} / ${probe.renderer}` : "WebGL is not available",
	);

	add(
		"webgl-software",
		!(probe.renderer && /llvmpipe|swiftshader|software|mesa offscreen/i.test(probe.renderer)),
		probe.renderer ?? "no renderer",
	);

	add(
		"native-code",
		probe.nativeCode,
		probe.nativeCode ? "core APIs are native" : "a core API was replaced by JavaScript",
	);

	add(
		"ua-hints",
		firefox ? !probe.hasUaData : probe.hasUaData,
		`userAgentData ${probe.hasUaData ? "present" : "absent"} for a ${firefox ? "Firefox" : "non-Firefox"} user agent`,
	);

	add(
		"chrome-object",
		firefox ? !probe.hasChrome : true,
		`window.chrome ${probe.hasChrome ? "present" : "absent"}`,
	);

	add(
		"pdf-viewer",
		!firefox || probe.pdfViewer === true,
		`pdfViewerEnabled ${probe.pdfViewer}`,
	);

	add("focus", probe.focused && probe.visible, `focused ${probe.focused}, visible ${probe.visible}`);

	add(
		"media-devices",
		(probe.mediaDevices === null || probe.mediaDevices > 0),
		probe.mediaTimeout
			? "enumerateDevices timeout (headless fallback, non-fatal)"
			: `${probe.mediaDevices} media devices`,
	);

	// --- Audio Context sample rate ---
	add(
		"audio-sample-rate",
		probe.audioSampleRate !== null && (probe.audioSampleRate === 44100 || probe.audioSampleRate === 48000),
		`AudioContext sampleRate ${probe.audioSampleRate ?? "unavailable"} (expected 44100 or 48000)`,
	);

	// --- Font enumeration ---
	add(
		"fonts-enumerated",
		probe.fontCount !== null && probe.fontCount > 0 && !probe.fontLoadError,
		`${probe.fontCount ?? "unknown"} fonts available${probe.fontLoadError ? " (load error)" : ""}`,
	);

	// --- WebGL shader precision (desktop GPUs should report highp float precision >= 23) ---
	add(
		"webgl-shader-precision",
		probe.webglPrecisionHighpFloat !== null && probe.webglPrecisionHighpFloat >= 23,
		`highp float precision ${probe.webglPrecisionHighpFloat ?? "unknown"} (expected ≥23 on desktop GPU)`,
	);

	// --- Client Hints platform consistency ---
	// Firefox must NOT expose userAgentData; when it does, platform must match navigator.platform
	add(
		"client-hints-platform",
		!firefox || probe.userAgentDataPlatform === null ||
			probe.userAgentDataPlatform === probe.platform.toLowerCase().replace("winnt", "windows").replace("macintosh", "mac"),
		`userAgentData.platform "${probe.userAgentDataPlatform ?? "absent"}" vs navigator.platform "${probe.platform}"`,
	);

	const passed = checks.filter((check) => check.ok).length;
	return { score: Math.round((passed / checks.length) * 100), checks };
}

export function lens(options: LensOptions = {}): BexxcvPlugin {
	return {
		name: "lens",
		order: 40,
		onPage(page) {
			if (options.audit === false || AUDITED.has(page)) return;
			AUDITED.add(page);
			page.once("load", () => {
				void auditFingerprint(page)
					.then((report) => {
						REPORTS.set(page, report);
						if (!options.quiet) {
							console.log(`[bexxcv] lens: fingerprint score ${report.score}/100`);
							for (const check of report.checks) {
								if (!check.ok) console.log(`[bexxcv] lens: ${check.id} failed, ${check.detail}`);
							}
						}
						if (options.out) {
							fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
							fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
						}
					})
					.catch(() => undefined);
			});
		},
	};
}
