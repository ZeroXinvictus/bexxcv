import type { Browser, BrowserContext, Page } from "playwright-core";
export type ContextOptions = NonNullable<Parameters<Browser["newContext"]>[0]>;
export interface ContextHooks {
    before?: (options: ContextOptions) => void | Promise<void>;
    after?: (context: BrowserContext, options: ContextOptions) => void | Promise<void>;
}
export declare function onEachContext<T extends Browser | BrowserContext>(target: T, hooks: ContextHooks): Promise<T>;
export declare function onEachPage<T extends Browser | BrowserContext>(target: T, handler: (page: Page) => void): T;
