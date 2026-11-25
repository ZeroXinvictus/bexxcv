import type { Page } from "playwright-core";
import type { BexxcvPlugin } from "./types.js";
/**
 * Handles Cloudflare JavaScript Detection (JSD) challenges.
 *
 * When JS Detections is enabled, Cloudflare injects a script that calls
 * `window.cloudflare.jsd.executeOnce({ callback(result) {} })`. The result
 * must be `"success"` for the challenge to pass. This plugin:
 *   1. Injects a safe wrapper via addInitScript before any page load
 *   2. Polls for the JSD callback to fire
 *   3. Waits until cf_clearance appears (JSD completion signal)
 */
export interface JsdOptions {
    /** Timeout for waiting for JSD completion after navigation (ms). Default 15 s. */
    timeout?: number;
    /** Poll interval while waiting for the JSD result (ms). Default 500. */
    interval?: number;
}
export declare function jsd(options?: JsdOptions): BexxcvPlugin;
/** Check whether the current page has passed its JSD challenge. */
export declare function isJsdPassed(page: Page): Promise<boolean>;
/** Attach JSD handling to an existing browser or context. */
export declare function attachJsd<T extends import("playwright-core").Browser | import("playwright-core").BrowserContext>(target: T, _options?: JsdOptions): T;
