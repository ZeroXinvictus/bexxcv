import { z } from "zod";
import { InvalidOptions } from "./exceptions.js";

type Spec = [z.ZodTypeAny, string];

const osName = z.enum(["linux", "macos", "windows"]);
const stringOrList = z.union([z.string(), z.array(z.string())]);
const positive = z.number().positive();

const SPEC: Record<string, Spec> = {
	os: [z.union([osName, z.array(osName)]), '"linux", "macos", "windows" or an array of them'],
	block_images: [z.boolean(), "a boolean"],
	block_webrtc: [z.boolean(), "a boolean"],
	block_webgl: [z.boolean(), "a boolean"],
	disable_coop: [z.boolean(), "a boolean"],
	geoip: [z.union([z.string().min(1), z.boolean()]), "a boolean or an IP string"],
	humanize: [z.union([z.boolean(), positive]), "a boolean or a number of seconds"],
	locale: [stringOrList, "a locale string or an array of locale strings"],
	addons: [z.array(z.string()), "an array of strings"],
	fonts: [z.array(z.string()), "an array of strings"],
	custom_fonts_only: [z.boolean(), "a boolean"],
	exclude_addons: [z.array(z.string()), "an array of strings"],
	screen: [
		z.object({
			minWidth: z.number().optional(),
			maxWidth: z.number().optional(),
			minHeight: z.number().optional(),
			maxHeight: z.number().optional(),
		}),
		"an object like { maxWidth, maxHeight }",
	],
	window: [z.tuple([positive, positive]), "a [width, height] pair"],
	fingerprint: [
		z.custom<Record<string, unknown>>(
			(v) => typeof v === "object" && v !== null && !Array.isArray(v),
		),
		"a fingerprint object",
	],
	ff_version: [z.number().int().positive(), "a positive integer"],
	headless: [z.union([z.boolean(), z.literal("virtual")]), 'true, false or "virtual"'],
	main_world_eval: [z.boolean(), "a boolean"],
	executable_path: [
		z.union([z.string().min(1), z.instanceof(URL), z.instanceof(Uint8Array)]),
		"a path string",
	],
	firefox_user_prefs: [z.record(z.string(), z.any()), "an object of Firefox prefs"],
	proxy: [
		z.union([
			z.string().min(1),
			z.object({
				server: z.string().min(1),
				username: z.string().optional(),
				password: z.string().optional(),
				bypass: z.string().optional(),
			}),
		]),
		"a proxy URL string or { server, username, password, bypass }",
	],
	enable_cache: [z.boolean(), "a boolean"],
	args: [z.array(z.string()), "an array of strings"],
	env: [
		z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
		"an object of environment variables",
	],
	debug: [z.boolean(), "a boolean"],
	virtual_display: [z.string(), "a display string such as :99"],
	webgl_config: [z.tuple([z.string(), z.string()]), "a [vendor, renderer] pair"],
	i_know_what_im_doing: [z.boolean(), "a boolean"],
	config: [
		z.custom<Record<string, unknown>>(
			(v) => typeof v === "object" && v !== null && !Array.isArray(v),
		),
		"an object",
	],
	user_data_dir: [z.string().min(1), "a directory path"],
	auto_xvfb: [z.boolean(), "a boolean"],
	turnstile: [
		z.union([
			z.boolean(),
			z.object({ interval: positive.optional(), retryAfter: positive.optional() }),
		]),
		"a boolean or { interval, retryAfter }",
	],
	preset: [z.literal("realistic"), 'the string "realistic"'],
	realism: [z.boolean(), "a boolean"],
	human: [
		z.union([
			z.boolean(),
			z.object({
				speed: positive.optional(),
				nativeCursor: z.boolean().optional(),
				typoRate: z.number().min(0).max(0.2).optional(),
			Think: z.union([z.tuple([positive, positive]), z.literal(false)]).optional(),
			}),
		]),
		"a boolean or { speed, nativeCursor, typoRate, think }",
	],
	gauntlet: [
		z.union([
			z.boolean(),
			z.object({
				solve: z.array(z.enum(["uam", "turnstile"])).optional(),
				maxTries: z.number().int().positive().optional(),
				timeout: positive.optional(),
				sustain: z.number().nonnegative().optional(),
			}),
		]),
		'a boolean or { solve: ["uam", "turnstile"], maxTries, timeout, sustain }',
	],
	wiretap: [
		z.union([
			z.boolean(),
			z.object({
				match: z.array(z.string()).optional(),
				methods: z.array(z.string()).optional(),
				out: z.string().min(1).optional(),
				bodies: z.boolean().optional(),
				maxBodyBytes: positive.optional(),
				streamTimeout: positive.optional(),
				redact: z.boolean().optional(),
			}),
		]),
		"a boolean or { match, methods, out, bodies, maxBodyBytes, streamTimeout, redact }",
	],
	stash: [
		z.union([
			z.string().min(1),
			z.object({
				file: z.string().min(1),
				names: z.array(z.string()).optional(),
				domains: z.array(z.string()).optional(),
				saveEvery: positive.optional(),
			}),
		]),
		"a file path or { file, names, domains, saveEvery }",
	],
	veneer: [
		z.union([z.boolean(), z.object({ strict: z.boolean().optional() })]),
		"a boolean or { strict }",
	],
	brake: [
		z.union([
			z.boolean(),
			z.object({
				maxRps: positive.optional(),
				respectRetryAfter: z.boolean().optional(),
				perHost: z.boolean().optional(),
				maxBackoff: positive.optional(),
			}),
		]),
		"a boolean or { maxRps, respectRetryAfter, perHost, maxBackoff }",
	],
	dodge: [
		z.object({
			pool: z.array(z.string().min(1)).min(1),
			rotateOn: z.array(z.number().int()).optional(),
			healthCheck: z.boolean().optional(),
			healthTimeout: positive.optional(),
			cooldown: positive.optional(),
			onBlocked: z
				.custom<(...args: unknown[]) => unknown>((v) => typeof v === "function")
				.optional(),
		}),
		"{ pool: [proxy urls], rotateOn, healthCheck, healthTimeout, cooldown, onBlocked }",
	],
	cocoon: [z.string().min(1), "a folder path"],
	lens: [
		z.union([
			z.boolean(),
			z.object({
				audit: z.boolean().optional(),
				target: z.literal("local").optional(),
				quiet: z.boolean().optional(),
				out: z.string().min(1).optional(),
			}),
		]),
		'a boolean or { audit, target: "local", quiet, out }',
	],
	plugins: [
		z.array(
			z.custom<{ name: string }>(
				(v) => typeof v === "object" && v !== null && typeof (v as { name?: unknown }).name === "string",
			),
		),
		"an array of plugin objects with a name",
	],
	uam: [
		z.union([
			z.boolean(),
			z.object({
				timeout: positive.optional(),
				interval: positive.optional(),
				waitOnGoto: z.boolean().optional(),
			}),
		]),
		"a boolean or { timeout, interval, waitOnGoto }",
	],
	hardware_concurrency_override: [z.number().int().positive(), "an integer (e.g., 8)"],
	device_memory_override: [z.number().int().min(2).max(64), "an integer (e.g., 8)"],
	timezone_jitter: [z.boolean(), "a boolean"],
	perf_jitter: [z.boolean(), "a boolean"],
	session_stickiness: [z.boolean(), "a boolean"],
	scroll_pattern: [z.enum(["natural", "linear", "burst"]), '"natural" | "linear" | "burst"'],
	idle_drift: [z.boolean(), "a boolean"],
	typo_rate: [z.number().min(0).max(0.5), "a float between 0 and 0.5"],
	mouse_acceleration: [z.boolean(), "a boolean"],
	browser: [z.enum(["firefox", "chromium"]), '"firefox" | "chromium" (default: "firefox")'],
	chromium_sandbox: [z.boolean(), "a boolean (Chromium sandbox)"],
};

const PASSTHROUGH = new Set([
	"allow_webgl",
	"channel",
	"chromiumSandbox",
	"devtools",
	"downloadsPath",
	"executablePath",
	"firefoxUserPrefs",
	"handleSIGHUP",
	"handleSIGINT",
	"handleSIGTERM",
	"ignoreDefaultArgs",
	"logger",
	"slowMo",
	"timeout",
	"tracesDir",
]);

const WARNED = new Set<string>();

function distance(a: string, b: string): number {
	const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let diag = prev[0]!;
		prev[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const next = prev[j]!;
			prev[j] = Math.min(
				prev[j]! + 1,
				prev[j - 1]! + 1,
				diag + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
			diag = next;
		}
	}
	return prev[b.length]!;
}

function closestKey(key: string): string | null {
	if (key.length < 4) return null;
	const lower = key.toLowerCase();
	let best: string | null = null;
	let bestDistance = 3;
	for (const candidate of Object.keys(SPEC)) {
		const d = distance(lower, candidate.toLowerCase());
		if (d < bestDistance) {
			bestDistance = d;
			best = candidate;
		}
	}
	return best;
}

function describe(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	if (typeof value === "string") {
		return `the string "${value.length > 24 ? `${value.slice(0, 24)}...` : value}"`;
	}
	if (typeof value === "object") return "an object";
	return `${typeof value} ${String(value)}`;
}

export function validateOptions(
	options: Record<string, unknown> | undefined,
): void {
	if (!options || process.env.BEXXCV_NO_VALIDATE) return;

	const problems: string[] = [];

	for (const [key, value] of Object.entries(options)) {
		if (value === undefined) continue;
		const spec = SPEC[key];
		if (spec) {
			if (!spec[0].safeParse(value).success) {
				problems.push(`${key}: expected ${spec[1]}, got ${describe(value)}`);
			}
			continue;
		}
		if (PASSTHROUGH.has(key) || WARNED.has(key)) continue;
		const hint = closestKey(key);
		if (hint) {
			WARNED.add(key);
			console.warn(`[bexxcv] Unknown option "${key}", did you mean "${hint}"?`);
		}
	}

	if (problems.length > 0) {
		throw new InvalidOptions(
			`Invalid bexxcv options:\n ${problems.join("\n ")}`,
		);
	}
}
