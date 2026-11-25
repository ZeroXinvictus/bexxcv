import { type HumanOptions } from "../human.js";
import type { BexxcvPlugin } from "./types.js";
export interface HumanPluginOptions extends HumanOptions {
    think?: [number, number] | false;
}
export declare function human(options?: HumanPluginOptions): BexxcvPlugin;
