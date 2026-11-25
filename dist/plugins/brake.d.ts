import type { BexxcvPlugin } from "./types.js";
export interface BrakeOptions {
    maxRps?: number;
    respectRetryAfter?: boolean;
    perHost?: boolean;
    maxBackoff?: number;
    /** Enable detection of Cloudflare 403s and back off accordingly. Default true. */
    respectCf403?: boolean;
}
export declare function brake(options?: BrakeOptions): BexxcvPlugin;
/** Get the current consecutive-403 counter for a host. */
export declare function getConsecutive403(host: string): number;
