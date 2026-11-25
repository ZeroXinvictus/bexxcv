import type { Browser, BrowserContext, Response } from "playwright-core";
import type { BexxcvPlugin } from "./types.js";

/**
 * Monitors Cloudflare Bot Management scores from response headers.
 *
 * When Bot Management is enabled, Cloudflare may expose the computed bot score
 * via custom headers. This plugin parses those headers and exposes them through
 * a query API so downstream code can make decisions based on the score.
 *
 * Supported header names (case-insensitive):
 *   - cf-bay-pass (Enterprise JS Detection pass/fail)
 *   - cf-ray (used alongside classification)
 *   - x-moz (Firefox-specific anti-bot marker observed in the wild)
 */

export interface BotScoreOptions {
	/** Cache collected scores per-context for later retrieval. Default true. */
	cache?: boolean;
}

interface ScoreEntry {
	url: string;
	score: number | null;
	src: string;
	timestamp: number;
}

const SCORES = new WeakMap<BrowserContext, ScoreEntry[]>();
const WATCHED = new WeakSet<object>();

/** Parse a bot-management score from a response. Returns null if not present. */
function parseBotScore(response: Response): { score: number | null; src: string } | null {
	const headers = response.headers();
	// Cloudflare Enterprise Bot Management sometimes echoes score
	const raw =
		headers["cf-bot-management-score"] ??
		headers["x-cf-bot-score"] ??
		headers["x-moz"] ??
		null;
	if (!raw) return null;
	const score = Number(raw);
	if (!Number.isFinite(score)) return null;
	return { score, src: raw };
}

export function botScore(options: BotScoreOptions = {}): BexxcvPlugin {
	const cacheEnabled = options.cache ?? true;

	return {
		name: "bot-score-monitor",
		order: 41,
		onContext(context) {
			if (!cacheEnabled) return;
			SCORES.set(context, []);
		},
		onPage(page) {
			if (WATCHED.has(page)) return;
			WATCHED.add(page);

			page.context()?.on?.("response", (response: Response) => {
				const result = parseBotScore(response);
				if (!result || result.score === null) return;

				const entry: ScoreEntry = {
					url: response.url(),
					score: result.score,
					src: result.src,
					timestamp: Date.now(),
				};

				if (cacheEnabled && page.context()) {
					const list = SCORES.get(page.context()) ?? [];
					list.push(entry);
					if (list.length > 50) list.shift();
					if (page.context()) SCORES.set(page.context(), list);
				}

				// Log low scores as warnings (score < 30 = likely automated per CF docs)
				if (result.score < 30) {
					console.warn(
						`[bexxcv] bot-score: low score ${result.score} on ${response.url()} (src: ${result.src})`,
					);
				}
			});
		},
	};
}

/** Retrieve cached bot-score entries for a context. */
export function getBotScores(context: BrowserContext): ScoreEntry[] {
	return SCORES.get(context) ?? [];
}

/** Get the average bot score across all cached entries for a context. */
export function avgBotScore(context: BrowserContext): number | null {
	const entries = SCORES.get(context) ?? [];
	const scored = entries.filter((e) => e.score !== null && e.score !== undefined);
	if (scored.length === 0) return null;
	return scored.reduce((sum, e) => sum + (e.score ?? 0), 0) / scored.length;
}

/** Check whether any recent score fell below threshold. */
export function hadLowScore(context: BrowserContext, threshold = 30, windowMs = 300_000): boolean {
	const now = Date.now();
	return SCORES.get(context)?.some(
		(e) => e.score !== null && e.score! < threshold && now - e.timestamp < windowMs,
	) ?? false;
}

/** Attach bot-score monitoring to an existing browser or context. */
export function attachBotScore<T extends Browser | BrowserContext>(
	target: T,
	_options: BotScoreOptions = {},
): T {
	void botScore(_options);
	return target;
}
