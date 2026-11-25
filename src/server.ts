import { type BrowserServer, firefox } from "playwright-core";
import { type LaunchOptions, launchOptions } from "./utils.js";

export async function launchServer(
	options: LaunchOptions,
): Promise<BrowserServer> {
	const opts = await launchOptions({ ...options, headless: true });
	return firefox.launchServer(opts);
}
