import type { Page } from "playwright-core";
export interface SessionOptions {
    timeout?: number;
    maxPages?: number;
    seedLength?: number;
}
interface SessionState {
    createdAt: number;
    pageCount: number;
    seedBuffer: Uint8Array;
}
export declare function getSessionId(page: Page): string | null;
export declare function initSession(page: Page, options?: SessionOptions): string;
export declare function getSession(state: SessionState): {
    seed: Uint8Array;
    now: number;
    elapsedMs: number;
    pageIndex: number;
};
export declare function getSeededFloat(state: SessionState, index: number): number;
export declare function getSeededInt(state: SessionState, index: number, min: number, max: number): number;
export declare function getSeededGauss(state: SessionState, index: number, mean: number, sd: number): number;
export declare function advancePage(page: Page): void;
export declare function endSession(page: Page): void;
export declare function isSessionExpired(page: Page, timeoutMs?: number): boolean;
export {};
