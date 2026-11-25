import type { Response } from "playwright-core";
import type { BexxcvPlugin } from "./types.js";

/**
 * Classifies Cloudflare challenge types from HTTP responses.
 *
 * Reads response status, selected headers (cf-ray, cf-cache-status, server),
 * and page title / body markers to decide which anti-bot layer fired and at
 * what clearance level. Results are attached to every page via a WeakMap so
 * downstream plugins (gauntlet, wiretap) can query them.
 */

export type ChallengeType =
	| "none"
	| "jsd"
	| "managed"
	| "interactive"
	| "non_interactive"
	| "turnstile"
	| "rate_limit"
	| "bot_score_low"
	| "unknown";

export type ClearanceLevel = "none" | "js" | "managed" | "high";

export interface ChallengeInfo {
	type: ChallengeType;
	clearanceLevel: ClearanceLevel;
	confidence: number; // 0-1
	reason: string;
	cfRay?: string;
	cached?: boolean;
}

const CHALLENGE_TITLES = new Set([
	"just a moment",
	"tunggu sebentar",
	"attention required",
	"security check",
	"un instant",
	"einen moment",
	"один момент",
	"um momento",
	"un momento",
]);

const JSD_BODY_MARKERS = [
	"window.cloudflare.jsd.executeOnce",
	"cdn-cgi/challenge-platform",
	"cf-jsds",
];

const TURNSTILE_MARKERS = ["cf-turnstile", "turnstile.render", "data-cf-widget"];

function classifyFromResponse(response: Response): ChallengeInfo | null {
	const status = response.status();
	const headers = response.headers();
	const cfRay = headers["cf-ray"] ?? headers["x-cf-ray"];
	const server = headers["server"] ?? "";
	const cacheStatus = headers["cf-cache-status"] ?? "";
	const contentType = headers["content-type"] ?? "";

	// 429 / 503 → rate limit
	if (status === 429 || status === 503) {
		return {
			type: "rate_limit",
			clearanceLevel: "none",
			confidence: 0.95,
			reason: `HTTP ${status} with Retry-After`,
			cfRay,
			cached: cacheStatus === "DYNAMIC",
		};
	}

	// Known blocked status with Cloudflare server header
	if ((status === 403 || status === 400) && /cloudflare/i.test(server)) {
		return {
			type: "managed",
			clearanceLevel: "managed",
			confidence: 0.85,
			reason: `HTTP ${status} from cloudflare server`,
			cfRay,
			cached: false,
		};
	}

	// Challenge page served (interactive / non-interactive / managed)
	if (
		status === 200 &&
		contentType.includes("text/html") &&
		/server.*cloudflare/i.test(server)
	) {
		return {
			type: "managed",
			clearanceLevel: "managed",
			confidence: 0.7,
			reason: "Cloudflare server returned HTML (possible challenge page)",
			cfRay,
			cached: cacheStatus === "MISS" || cacheStatus === "EXPIRED",
		};
	}

	return null;
}

function classifyFromBody(body: string, title: string): ChallengeInfo | null {
	const lowerTitle = title.toLowerCase();
	const lowerBody = body.toLowerCase();

	// JSD marker
	for (const marker of JSD_BODY_MARKERS) {
		if (lowerBody.includes(marker)) {
			return {
				type: "jsd",
				clearanceLevel: "js",
				confidence: 0.9,
				reason: "JS Detection script found in response body",
			};
		}
	}

	// Turnstile marker
	for (const marker of TURNSTILE_MARKERS) {
		if (lowerBody.includes(marker)) {
			return {
				type: "turnstile",
				clearanceLevel: "managed",
				confidence: 0.85,
				reason: "Turnstile widget markup found in response body",
			};
		}
	}

	// Title-based classification
	if (CHALLENGE_TITLES.has(lowerTitle.trim())) {
		// Distinguish interactive vs non-interactive by DOM clues
		const hasCheckbox = /checkbox|select-a|choose/i.test(lowerBody);
		const hasButton = /button|continue|proceed/i.test(lowerBody);
		const clearance: ClearanceLevel = hasCheckbox || hasButton ? "high" : "js";
		const type: ChallengeType = hasCheckbox || hasButton ? "interactive" : "non_interactive";
		return {
			type,
			clearanceLevel: clearance,
			confidence: 0.95,
			reason: `Challenge title matched: "${lowerTitle.trim()}"`,
		};
	}

	return null;
}

const INFO_MAP = new WeakMap<Response, ChallengeInfo>();
const PAGE_INFO = new WeakMap<{ id: string }, ChallengeInfo[]>();

/** Cache the last N challenge infos per page (by page object identity). */
const PAGE_HIST = new WeakMap<object, ChallengeInfo[]>();

export function challengeInfoFor(response: Response): ChallengeInfo | null {
	const cached = INFO_MAP.get(response);
	if (cached) return cached;
	const info = classifyFromResponse(response) ?? null;
	if (info) INFO_MAP.set(response, info);
	return info;
}

export function pageChallengeHistory(page: { id: string }): ChallengeInfo[] {
	return PAGE_HIST.get(page) ?? [];
}

export function appendChallengeInfo(page: { id: string }, info: ChallengeInfo): void {
	const hist = PAGE_HIST.get(page) ?? [];
	hist.push(info);
	if (hist.length > 20) hist.shift();
	PAGE_HIST.set(page, hist);
}

export function latestChallenge(page: { id: string }): ChallengeInfo | null {
	const hist = PAGE_HIST.get(page) ?? [];
	return hist.length > 0 ? hist[hist.length - 1]! : null;
}

export function classifyResponse(response: Response): ChallengeInfo {
	const fromResp = classifyFromResponse(response);
	if (fromResp) return fromResp;

	// Fallback: try to read body for HTML responses
	if (response.headers()["content-type"]?.includes("text/html")) {
		try {
			const body = response.text().then(String).catch(() => "");
			body.then((b) => {
				const fromBody = classifyFromBody(b, "");
				if (fromBody) appendChallengeInfo({ id: response.url() }, fromBody);
			});
		} catch {
			// ignore
		}
	}

	return {
		type: "none",
		clearanceLevel: "none",
		confidence: 0,
		reason: "No challenge signals detected",
	};
}

export function classifyPage(page: {
	url(): string;
	title(): Promise<string>;
}): Promise<ChallengeInfo> {
	return page.title().then((title) => {
		const info = classifyFromBody("", title);
		return info ?? { type: "none", clearanceLevel: "none", confidence: 0, reason: "Title clean" };
	});
}

export function challengePlugin(): BexxcvPlugin {
	return {
		name: "challenge-classify",
		order: 40,
		onContext(context) {
			context.on("response", (response) => {
				const info = challengeInfoFor(response);
				if (info && info.type !== "none") {
					appendChallengeInfo(
						{ id: response.url() },
						info,
					);
				}
			});
		},
	};
}
