import { firefox, } from "playwright-core";
import { attachNoViewportDefault, launchOptions, spoofsWindowDimensions, syncAttachVD, } from "./utils.js";
import { warnIfDataStale } from "./doctor.js";
import { validateOptions } from "./schema.js";
import { attachTurnstile } from "./turnstile.js";
import { applyPlugins, buildPlugins, runBeforeLaunch, stripPluginOptions, } from "./plugins/index.js";
import { attachUam } from "./uam.js";
import { VirtualDisplay } from "./virtdisplay.js";
import { needsXvfb } from "./xvfb.js";
function applyPreset(options) {
    if (options.preset !== "realistic")
        return options;
    return {
        ...options,
        humanize: options.humanize ?? true,
        geoip: options.geoip ?? true,
        enable_cache: options.enable_cache ?? true,
        realism: options.realism ?? true,
    };
}
export async function Bexxcv(launch_options = {}, extraPlugins = []) {
    validateOptions(launch_options);
    warnIfDataStale();
    launch_options = applyPreset(launch_options);
    const pluginList = [
        ...buildPlugins(launch_options),
        ...extraPlugins,
    ];
    launch_options = { ...launch_options };
    await runBeforeLaunch(pluginList, launch_options);
    const { headless, user_data_dir, auto_xvfb = true, turnstile = false, uam = false, preset: _preset, ...restOptions } = launch_options;
    const opts = stripPluginOptions(restOptions);
    const needsDisplay = auto_xvfb && needsXvfb();
    const effectiveHeadless = (() => {
        if (headless === "virtual")
            return "virtual";
        if (headless === true)
            return true;
        if (needsDisplay)
            return "virtual";
        return headless ?? false;
    })();
    const launched = await NewBrowser(firefox, effectiveHeadless, {}, user_data_dir ?? false, false, opts);
    if (turnstile) {
        attachTurnstile(launched, turnstile === true ? {} : turnstile);
    }
    if (uam) {
        attachUam(launched, uam === true ? {} : uam);
    }
    if (pluginList.length > 0) {
        await applyPlugins(launched, pluginList);
    }
    return launched;
}
export const Camoufox = Bexxcv;
export async function NewBrowser(playwright, headless = false, fromOptions = {}, userDataDir = false, debug = false, launch_options = {}) {
    let virtualDisplay = null;
    const normalizedHeadless = headless === "virtual" ? false : headless || false;
    if (headless === "virtual") {
        virtualDisplay = new VirtualDisplay(debug);
        launch_options.virtual_display = await virtualDisplay.get();
    }
    if (!fromOptions || Object.keys(fromOptions).length === 0) {
        fromOptions = await launchOptions({
            debug,
            ...launch_options,
            headless: normalizedHeadless,
        });
    }
    const noViewportDefault = spoofsWindowDimensions(fromOptions);
    if (typeof userDataDir === "string") {
        if (noViewportDefault && !("viewport" in fromOptions)) {
            fromOptions = { ...fromOptions, viewport: null };
        }
        const context = await playwright.launchPersistentContext(userDataDir, fromOptions);
        return syncAttachVD(context, virtualDisplay);
    }
    const browser = await playwright.launch(fromOptions);
    if (noViewportDefault) {
        attachNoViewportDefault(browser);
    }
    return syncAttachVD(browser, virtualDisplay);
}
