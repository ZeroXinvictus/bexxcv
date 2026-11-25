import type { Browser, BrowserContext, Page } from "playwright-core";
import type { BexxcvPlugin } from "./types.js";
/**
 * Validates Cloudflare Precursor cookie consistency.
 *
 * Cloudflare sometimes issues a precursor cookie (domain: `.cloudflare.com` or
 * the challenge domain) that must stay in sync with `cf_clearance`. If the
 * precursor value changes between requests while browsing the same origin, it
 * usually means the session was re-challenged and the old clearance is stale.
 *
 * This plugin detects such drift and emits a warning + optional reload signal.
 */
export interface PrecursorOptions {
    /** Emit a console warning when drift is detected. Default true. */
    warn?: boolean;
    /** Call reload() on the page when drift exceeds threshold. Default false. */
    autoReload?: boolean;
    /** Cookie names to watch besides cf_clearance. */
    names?: string[];
}
interface SessionState {
    precursorValue: string | null;
    clearanceValue: string | null;
    lastCheckAt: number;
    driftCount: number;
}
export declare function precursor(options?: PrecursorOptions): BexxcvPlugin;
/** Get current precursor state for a page. */
export declare function getPrecursorState(page: Page): SessionState | null;
/** Force-reset precursor state (call after manual cookie injection). */
export declare function resetPrecursorState(page: Page): void;
/** Attach precursor validation to an existing browser or context. */
export declare function attachPrecursor<T extends Browser | BrowserContext>(target: T, options?: PrecursorOptions): T;
export {};
