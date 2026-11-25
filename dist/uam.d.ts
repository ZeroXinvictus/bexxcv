import type { Browser, BrowserContext, Page } from "playwright-core";
import { type HumanOptions } from "./human.js";
export interface UamOptions {
    /** Max time to wait for a cf_clearance cookie after navigation (ms). */
    timeout?: number;
    /** Polling interval when watching for new challenges (ms). */
    interval?: number;
    /** Whether to wait for clearance right after each page.goto(). */
    waitOnGoto?: boolean;
    /**
     * Optional external helper that can perform an action on the challenge page
     * (e.g. click a checkbox). Return true if an action was taken.
     */
    assist?: (page: Page) => Promise<boolean>;
    /** Forwarded to the internal {@link Human} actor for mouse movements. */
    human?: HumanOptions;
}
export interface UamResult {
    challenged: boolean;
    bypassed: boolean;
    cookie: string | null;
}
export declare function isChallenge(page: Page): Promise<boolean>;
export declare function humanActivity(page: Page, scale?: number): Promise<void>;
/**
 * Waits until a `cf_clearance` cookie is present for the current page origin.
 * If a challenge page was seen, performs light human-like activity while
 * polling — matching the strategy used by cf-clearance-scraper.
 */
export declare function waitForUam(page: Page, options?: UamOptions): Promise<UamResult>;
export declare function watchUam(page: Page, options?: UamOptions): void;
export declare function attachUam<T extends Browser | BrowserContext>(target: T, options?: UamOptions): T;
