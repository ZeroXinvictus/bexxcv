import type { Browser, BrowserContext } from "playwright-core";
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
export declare function botScore(options?: BotScoreOptions): BexxcvPlugin;
/** Retrieve cached bot-score entries for a context. */
export declare function getBotScores(context: BrowserContext): ScoreEntry[];
/** Get the average bot score across all cached entries for a context. */
export declare function avgBotScore(context: BrowserContext): number | null;
/** Check whether any recent score fell below threshold. */
export declare function hadLowScore(context: BrowserContext, threshold?: number, windowMs?: number): boolean;
/** Attach bot-score monitoring to an existing browser or context. */
export declare function attachBotScore<T extends Browser | BrowserContext>(target: T, _options?: BotScoreOptions): T;
export {};
