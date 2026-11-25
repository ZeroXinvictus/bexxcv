import type { Page } from "playwright-core";
import type { BexxcvPlugin } from "./types.js";
export interface LensOptions {
    audit?: boolean;
    target?: "local";
    quiet?: boolean;
    out?: string;
}
export interface LensCheck {
    id: string;
    ok: boolean;
    detail: string;
}
export interface LensReport {
    score: number;
    checks: LensCheck[];
}
export declare function lensReport(page: Page): LensReport | null;
export declare function auditFingerprint(page: Page): Promise<LensReport>;
export declare function lens(options?: LensOptions): BexxcvPlugin;
