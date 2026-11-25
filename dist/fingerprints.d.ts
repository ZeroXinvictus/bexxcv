import { type Fingerprint, type FingerprintGeneratorOptions, type ScreenFingerprint } from "fingerprint-generator";
export declare const SUPPORTED_OS: readonly ["linux", "macos", "windows"];
export declare function cryptoRandInt(min: number, max: number): number;
export declare function cryptoFloat(): number;
export interface ExtendedScreen extends ScreenFingerprint {
    screenY?: number;
    audioSeed?: number;
    canvasSeed?: number;
    webglVendor?: string;
    webglRenderer?: string;
    webglGLSL?: string;
    webglExtensions?: string[];
    fontSpacingSeed?: number;
    perfJitter?: number;
    timezoneOffsetJitter?: number;
    memoryMultiplier?: number;
    hardwareConcurrencySeed?: number;
    touchSupport?: boolean;
    touchPoints?: number;
    pointerType?: "mouse" | "touch" | "pen";
    onlineState?: boolean;
    platformDeviceMemory?: number;
}
export declare function generateFingerprint(window?: [number, number], config?: Partial<FingerprintGeneratorOptions>): Fingerprint & ExtendedScreen;
export declare function fromBrowserforge(fingerprint: Fingerprint, ffVersion?: string): Record<string, any>;
/**
 * Returns a realistic font list for the given OS.
 * These are actual system fonts that would appear on that platform.
 */
export declare function getRealisticFonts(os: string): string[];
