import { type BrowserServer } from "playwright-core";
import { type LaunchOptions } from "./utils.js";
export declare function launchServer(options: LaunchOptions): Promise<BrowserServer>;
