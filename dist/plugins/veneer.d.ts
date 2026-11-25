import type { BexxcvPlugin } from "./types.js";
export interface VeneerOptions {
    strict?: boolean;
}
export declare function veneer(options?: VeneerOptions): BexxcvPlugin;
