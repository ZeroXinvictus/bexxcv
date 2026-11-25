import { firefox } from "playwright-core";
import { launchOptions } from "./utils.js";
export async function launchServer(options) {
    const opts = await launchOptions({ ...options, headless: true });
    return firefox.launchServer(opts);
}
