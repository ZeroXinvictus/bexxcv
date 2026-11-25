import type { Browser, BrowserContext, Page } from "playwright-core";
export interface TurnstileOptions {
    /** Polling interval for checking widget state (ms). */
    interval?: number;
    /** Minimum time between repeated clicks on the same widget (ms). */
    retryAfter?: number;
}
export interface Widget {
    x: number;
    y: number;
    w: number;
    h: number;
    solved: boolean;
    key: string;
}
export declare function findWidgets(page: Page): Promise<Widget[]>;
export declare function readTurnstileToken(page: Page): Promise<string | null>;
export declare function createClicker(retryAfter?: number): (page: Page) => Promise<boolean>;
export declare function solveTurnstile(page: Page, timeout?: number, idleChecks?: number, retryAfter?: number): Promise<string | null>;
export declare function watchTurnstile(page: Page, options?: TurnstileOptions): void;
export declare function attachTurnstile<T extends Browser | BrowserContext>(target: T, options?: TurnstileOptions): T;
