import type { BexxcvPlugin } from "./types.js";
export interface CocoonOptions {
    dir: string;
}
export declare function cocoon(input: string | CocoonOptions): BexxcvPlugin;
