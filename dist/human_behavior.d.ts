import type { Page } from "playwright-core";
export interface HumanBehaviorOptions {
    speed?: number;
    typoRate?: number;
    scrollPattern?: "natural" | "linear" | "burst";
    idleDrift?: boolean;
    sessionTimeout?: number;
    maxPagesPerSession?: number;
    pageTransitionMinMs?: number;
    pageTransitionMaxMs?: number;
    mouseAcceleration?: boolean;
}
export declare function attachHumanBehavior(page: Page, options?: HumanBehaviorOptions): void;
export declare function detachHumanBehavior(page: Page): void;
export declare function getSessionInfo(page: Page): {
    id: string | null;
    pageCount: number;
    ageMs: number;
} | null;
export declare function sleep(ms: number): Promise<void>;
