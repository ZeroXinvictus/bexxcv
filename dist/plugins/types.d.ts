import type { Browser, BrowserContext, Page } from "playwright-core";
import { type ContextOptions } from "../pagehooks.js";
export interface BexxcvPlugin {
    name: string;
    order?: number;
    beforeLaunch?(options: Record<string, unknown>): void | Promise<void>;
    beforeContext?(options: ContextOptions): void | Promise<void>;
    onContext?(context: BrowserContext, options: ContextOptions): void | Promise<void>;
    onPage?(page: Page, context: BrowserContext): void;
    beforeClose?(contexts: BrowserContext[]): void | Promise<void>;
}
export declare function runBeforeLaunch(plugins: BexxcvPlugin[], options: Record<string, unknown>): Promise<void>;
export declare function applyPlugins<T extends Browser | BrowserContext>(target: T, plugins: BexxcvPlugin[]): Promise<T>;
