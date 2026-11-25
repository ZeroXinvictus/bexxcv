import { type Browser, type BrowserContext, type BrowserType } from "playwright-core";
import { type LaunchOptions } from "./utils.js";
import { type TurnstileOptions } from "./turnstile.js";
import { type BexxcvPlugin, type PluginOptions } from "./plugins/index.js";
import { type UamOptions } from "./uam.js";
export interface BexxcvOptions extends LaunchOptions {
    user_data_dir?: string;
    auto_xvfb?: boolean;
    turnstile?: boolean | TurnstileOptions;
    uam?: boolean | UamOptions;
    preset?: "realistic";
    /** Browser engine to use. Default "firefox". */
    browser?: "firefox" | "chromium";
}
export type BexxcvLaunchOptions = BexxcvOptions & PluginOptions;
export declare function Bexxcv<UserDataDir extends string | undefined = undefined, ReturnType = UserDataDir extends string ? BrowserContext : Browser>(launch_options?: BexxcvOptions & PluginOptions & {
    user_data_dir?: UserDataDir;
}, extraPlugins?: BexxcvPlugin[]): Promise<ReturnType>;
export declare const Camoufox: typeof Bexxcv;
export declare function NewBrowser<UserDataDir extends string | false = false, ReturnType = UserDataDir extends string ? BrowserContext : Browser>(playwright: BrowserType<Browser>, headless?: boolean | "virtual", fromOptions?: Record<string, any>, userDataDir?: UserDataDir, debug?: boolean, launch_options?: LaunchOptions): Promise<ReturnType>;
