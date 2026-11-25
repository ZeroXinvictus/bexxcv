import type { Browser, BrowserContext, Page } from "playwright-core";
import type { BexxcvPlugin } from "./types.js";
/**
 * Extracts and replays Turnstile Ephemeral IDs.
 *
 * Cloudflare's Turnstile assigns an ephemeral_id per session that is sent back
 * in the token payload. When the same widget is solved again (e.g. after a
 * navigation), Cloudflare cross-references this id against the previous solve.
 * Storing and replaying it reduces the chance of a fresh interactive challenge.
 */
export interface EphemeralOptions {
    /** Max age of a stored ephemeral entry before it is considered stale (ms). Default 10 min. */
    maxAgeMs?: number;
    /** If true, replay the ephemeral_id even if no new turnstile widget appears on next page. */
    autoReplay?: boolean;
}
interface EphemeralEntry {
    widgetKey: string;
    ephemeralId: string;
    expiresAt: number;
}
export declare function ephemeral(options?: EphemeralOptions): BexxcvPlugin;
/** Retrieve stored ephemeral entries for a context. */
export declare function getEphemeralEntries(context: BrowserContext): EphemeralEntry[];
/** Inject a stored ephemeral_id back into a hidden input on the target page. */
export declare function replayEphemeral(page: Page, ephemeralId: string): Promise<boolean>;
export declare function attachEphemeral<T extends Browser | BrowserContext>(target: T, options?: EphemeralOptions): T;
export {};
