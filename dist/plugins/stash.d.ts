import type { BexxcvPlugin } from "./types.js";
export interface StashOptions {
    file: string;
    names?: string[];
    domains?: string[];
    saveEvery?: number;
}
export declare function stash(input: string | StashOptions): BexxcvPlugin;
