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
export type ChallengeType = "none" | "jsd" | "managed" | "interactive" | "non_interactive" | "turnstile" | "rate_limit" | "bot_score_low" | "unknown";
export type ClearanceLevel = "none" | "js" | "managed" | "high";
export interface ChallengeInfo {
    type: ChallengeType;
    clearanceLevel: ClearanceLevel;
    confidence: number;
    reason: string;
    cfRay?: string;
    cached?: boolean;
}
export declare function challengeInfoFor(response: Response): ChallengeInfo | null;
export declare function pageChallengeHistory(page: {
    id: string;
}): ChallengeInfo[];
export declare function appendChallengeInfo(page: {
    id: string;
}, info: ChallengeInfo): void;
export declare function latestChallenge(page: {
    id: string;
}): ChallengeInfo | null;
export declare function classifyResponse(response: Response): ChallengeInfo;
export declare function classifyPage(page: {
    url(): string;
    title(): Promise<string>;
}): Promise<ChallengeInfo>;
export declare function challengePlugin(): BexxcvPlugin;
