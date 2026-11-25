import type { Page } from "playwright-core";
import { type UamResult } from "../uam.js";
import type { BexxcvPlugin } from "./types.js";
export interface GauntletOptions {
    solve?: Array<"uam" | "turnstile">;
    maxTries?: number;
    timeout?: number;
    sustain?: number;
    watch?: boolean;
    interval?: number;
    maxRuntime?: number;
}
export interface GauntletResult {
    passed: boolean;
    tries: number;
    uam: UamResult | null;
    turnstile: string | null;
}
export declare function gauntletResult(page: Page): GauntletResult | null;
export declare function runGauntlet(page: Page, options?: GauntletOptions): Promise<GauntletResult>;
export declare function gauntlet(options?: GauntletOptions): BexxcvPlugin;
