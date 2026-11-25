import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { UAParser } from "ua-parser-js";
import { addDefaultAddons, confirmPaths, } from "./addons.js";
import { InvalidOS, InvalidPropertyType, NonFirefoxFingerprint, UnknownProperty, } from "./exceptions.js";
import { cryptoFloat, fromBrowserforge, generateFingerprint, SUPPORTED_OS, } from "./fingerprints.js";
import { publicIP, validIPv4, validIPv6 } from "./ip.js";
import { coherentDprWeights, languageList, realismDefaults, reconcileWebglKeys, snapScreen, } from "./realism.js";
import { geoipAllowed, getGeolocation, handleLocales } from "./locale.js";
import FONTS from "./mappings/fonts.config.js";
import { ensureCamoufoxInstalled, getPath, installedVerStr, launchPath, OS_NAME, } from "./pkgman.js";
import { LeakWarning } from "./warnings.js";
import { sampleWebGL } from "./webgl/sample.js";
function cryptoRandInt(min, max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return min + (buf[0] % (max - min + 1));
}
function weightedPick(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    let threshold = (buf[0] / 0x100000000) * total;
    for (let i = 0; i < items.length; i++) {
        threshold -= weights[i];
        if (threshold <= 0)
            return items[i];
    }
    return items[items.length - 1];
}
const DPR_POOLS = {
    mac: [[2, 70], [1, 20], [1.5, 10]],
    win: [[1, 45], [1.25, 20], [1.5, 20], [2, 15]],
    lin: [[1, 75], [2, 15], [1.5, 10]],
};
const CACHE_PREFS = {
    "browser.sessionhistory.max_entries": 10,
    "browser.sessionhistory.max_total_viewers": -1,
    "browser.cache.memory.enable": true,
    "browser.cache.disk_cache_ssl": true,
    "browser.cache.disk.smart_size.enabled": true,
};
function getEnvVars(configMap, userAgentOS) {
    const envVars = {};
    let updatedConfigData;
    try {
        updatedConfigData = new TextEncoder().encode(JSON.stringify(configMap));
    }
    catch (e) {
        console.error(`Error updating config: ${e}`);
        process.exit(1);
    }
    const chunkSize = OS_NAME === "win" ? 2047 : 32767;
    const configStr = new TextDecoder().decode(updatedConfigData);
    for (let i = 0; i < configStr.length; i += chunkSize) {
        const chunk = configStr.slice(i, i + chunkSize);
        const envName = `CAMOU_CONFIG_${Math.floor(i / chunkSize) + 1}`;
        try {
            envVars[envName] = chunk;
        }
        catch (e) {
            console.error(`Error setting ${envName}: ${e}`);
            process.exit(1);
        }
    }
    if (OS_NAME === "lin") {
        const fontconfigPath = getPath(path.join("fontconfig", userAgentOS));
        envVars.FONTCONFIG_PATH = fontconfigPath;
    }
    return envVars;
}
export function getAsBooleanFromENV(name, defaultValue) {
    const value = process.env[name];
    if (value === "false" || value === "0")
        return false;
    if (value)
        return true;
    return !!defaultValue;
}
function loadProperties(filePath) {
    let propFile;
    filePath = filePath?.toString();
    if (filePath) {
        propFile = path.join(path.dirname(filePath), "properties.json");
    }
    else {
        propFile = getPath("properties.json");
    }
    const propData = readFileSync(propFile).toString();
    const propDict = JSON.parse(propData);
    return propDict.reduce((acc, prop) => {
        acc[prop.property] = prop.type;
        return acc;
    }, {});
}
/**
 * High-level behavioral property seeding.
 * These are properties that aren't part of the raw fingerprint generator output
 * but significantly affect detection scores when left at defaults or missing.
 */
function seedBehavioralProperties(config, fpExtended, targetOS, headless, knownProperties, firefoxUserPrefs) {
    // --- Battery API ---
    // Desktops → always discharging with long remaining time.
    // Laptops/macs → mixed charging states (real Macs report ~50-90% on most machines).
    if ("battery:level" in knownProperties) {
        const isLaptop = targetOS === "mac" || (targetOS === "win" && cryptoFloat() < 0.6);
        if (isLaptop) {
            setInto(config, "battery:level", +(0.2 + cryptoFloat() * 0.75).toFixed(2));
            if (cryptoFloat() < 0.25) {
                setInto(config, "battery:charging", true);
                setInto(config, "battery:chargingTime", 0);
                setInto(config, "battery:dischargingTime", +(900 + cryptoRandInt(0, 7200)).toString());
            }
            else {
                setInto(config, "battery:charging", false);
                setInto(config, "battery:chargingTime", Infinity);
                setInto(config, "battery:dischargingTime", +(600 + cryptoRandInt(0, 10800)).toString());
            }
        }
        else {
            setInto(config, "battery:level", 1);
            setInto(config, "battery:charging", false);
            setInto(config, "battery:chargingTime", Infinity);
            setInto(config, "battery:dischargingTime", Infinity);
        }
    }
    // --- Media devices ---
    // Realistic counts per OS: desktops often have 0-1 mic, laptops 1-2, webcams 0-2
    const micPool = [0, 0, 1, 1, 1, 2, 2];
    const camPool = [0, 0, 0, 1, 1, 2];
    const spkPool = [0, 1, 1, 1, 2, 2, 3, 4];
    if ("mediaDevices:enabled" in knownProperties)
        setInto(config, "mediaDevices:enabled", true);
    if ("mediaDevices:micros" in knownProperties)
        setInto(config, "mediaDevices:micros", micPool[cryptoRandInt(0, micPool.length - 1)]);
    if ("mediaDevices:webcams" in knownProperties)
        setInto(config, "mediaDevices:webcams", camPool[cryptoRandInt(0, camPool.length - 1)]);
    if ("mediaDevices:speakers" in knownProperties)
        setInto(config, "mediaDevices:speakers", spkPool[cryptoRandInt(0, spkPool.length - 1)]);
    // --- Speech synthesis voices ---
    // Match locale language; vary count realistically
    if ("voices" in knownProperties) {
        const voiceCount = 2 + cryptoRandInt(0, 8);
        const voiceList = [];
        const lang = config["locale:language"] ?? "en";
        for (let i = 0; i < voiceCount; i++) {
            voiceList.push({ lang, name: `${lang}-Voice-${i + 1}` });
        }
        config["voices"] = voiceList;
        if ("voices:blockIfNotDefined" in knownProperties)
            setInto(config, "voices:blockIfNotDefined", false);
        if ("voices:fakeCompletion" in knownProperties)
            setInto(config, "voices:fakeCompletion", false);
    }
    // --- Do Not Track ---
    // ~20% of real users have DNT enabled
    if ("navigator.doNotTrack" in knownProperties) {
        setInto(config, "navigator.doNotTrack", cryptoFloat() < 0.2 ? "1" : "0");
    }
    // --- Global Privacy Control ---
    // ~10% of browsers signal GPC
    if ("navigator.globalPrivacyControl" in knownProperties) {
        setInto(config, "navigator.globalPrivacyControl", cryptoFloat() < 0.1);
    }
    // --- Cookie enabled ---
    if ("navigator.cookieEnabled" in knownProperties)
        setInto(config, "navigator.cookieEnabled", true);
    // --- Online state ---
    // Very rarely offline
    if ("navigator.onLine" in knownProperties) {
        setInto(config, "navigator.onLine", cryptoFloat() > 0.002);
    }
    if (!headless) {
        firefoxUserPrefs["privacy.referrer_policy"] = 1; // Same-Origin on cross-origin
    }
    // --- Max touch points consistency ---
    if ("navigator.maxTouchPoints" in knownProperties) {
        if (fpExtended.touchSupport) {
            setInto(config, "navigator.maxTouchPoints", fpExtended.touchPoints);
        }
        else {
            setInto(config, "navigator.maxTouchPoints", 0);
        }
    }
    // --- Performance timing jitter is already handled via performance:now_jitter above
}
function formatTimezoneOffset(minutes) {
    const sign = minutes >= 0 ? "+" : "-";
    const abs = Math.abs(minutes);
    const hours = Math.floor(abs / 60);
    const mins = abs % 60;
    return `${sign}${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}
function validateConfig(configMap, propertyTypes) {
    for (const [key, value] of Object.entries(configMap)) {
        const expectedType = propertyTypes[key];
        if (!expectedType) {
            throw new UnknownProperty(`Unknown property ${key} in config`);
        }
        if (!validateType(value, expectedType)) {
            throw new InvalidPropertyType(`Invalid type for property ${key}. Expected ${expectedType}, got ${typeof value}`);
        }
    }
}
function validateType(value, expectedType) {
    switch (expectedType) {
        case "str":
            return typeof value === "string";
        case "int":
            return Number.isInteger(value);
        case "uint":
            return Number.isInteger(value) && value >= 0;
        case "double":
            return typeof value === "number";
        case "bool":
            return typeof value === "boolean";
        case "array":
            return Array.isArray(value);
        case "dict":
            return (typeof value === "object" && value !== null && !Array.isArray(value));
        default:
            return false;
    }
}
function getTargetOS(config) {
    if (config["navigator.userAgent"]) {
        return determineUAOS(config["navigator.userAgent"]);
    }
    return OS_NAME;
}
function determineUAOS(userAgent) {
    const parser = new UAParser(userAgent);
    const parsedUA = parser.getOS().name;
    if (!parsedUA) {
        throw new Error("Could not determine OS from user agent");
    }
    if (parsedUA.startsWith("macOS")) {
        return "mac";
    }
    if (parsedUA.startsWith("Windows")) {
        return "win";
    }
    return "lin";
}
function getScreenCons(headless) {
    if (headless === false)
        return undefined;
    if (OS_NAME === "lin") {
        try {
            const out = execFileSync("xrandr", ["--current"], {
                timeout: 2_000,
                stdio: ["ignore", "pipe", "ignore"],
            }).toString();
            const m = out.match(/(\d+)x(\d+)\+0\+0/);
            if (m) {
                return {
                    maxWidth: parseInt(m[1], 10),
                    maxHeight: parseInt(m[2], 10),
                };
            }
        }
        catch {
            return undefined;
        }
    }
    return undefined;
}
function updateFonts(config, targetOS) {
    const fonts = FONTS[targetOS];
    if (config.fonts) {
        config.fonts = Array.from(new Set([...fonts, ...config.fonts]));
    }
    else {
        config.fonts = fonts;
    }
}
function checkCustomFingerprint(fingerprint) {
    const parser = new UAParser(fingerprint.navigator.userAgent);
    const browserName = parser.getBrowser().name || "Non-Firefox";
    if (browserName !== "Firefox") {
        throw new NonFirefoxFingerprint(`"${browserName}" fingerprints are not supported in Camoufox. Using fingerprints from a browser other than Firefox WILL lead to detection. If this is intentional, pass i_know_what_im_doing=True.`);
    }
    LeakWarning.warn("custom_fingerprint", false);
}
function validateOS(os) {
    if (!os)
        return undefined;
    if (Array.isArray(os)) {
        os.every(validateOS);
        return [...os];
    }
    if (!SUPPORTED_OS.includes(os)) {
        throw new InvalidOS(`Camoufox does not support the OS: '${os}'`);
    }
    return [os];
}
function _cleanLocals(data) {
    delete data.playwright;
    delete data.persistentContext;
    return data;
}
function mergeInto(target, source) {
    Object.entries(source).forEach(([key, value]) => {
        if (!(key in target)) {
            target[key] = value;
        }
    });
}
function setInto(target, key, value) {
    if (!(key in target)) {
        target[key] = value;
    }
}
function isDomainSet(config, ...properties) {
    return properties.some((prop) => {
        if (prop.endsWith(".") || prop.endsWith(":")) {
            return Object.keys(config).some((key) => key.startsWith(prop));
        }
        return prop in config;
    });
}
function warnManualConfig(config) {
    if (isDomainSet(config, "navigator.language", "navigator.languages", "headers.Accept-Language", "locale:")) {
        LeakWarning.warn("locale", false);
    }
    if (isDomainSet(config, "geolocation:", "timezone")) {
        LeakWarning.warn("geolocation", false);
    }
    if (isDomainSet(config, "headers.User-Agent")) {
        LeakWarning.warn("header-ua", false);
    }
    if (isDomainSet(config, "navigator.")) {
        LeakWarning.warn("navigator", false);
    }
    if (isDomainSet(config, "screen.", "window.", "document.body.")) {
        LeakWarning.warn("viewport", false);
    }
}
const WINDOW_DIM_KEYS = [
    "window.outerWidth",
    "window.outerHeight",
    "window.innerWidth",
    "window.innerHeight",
    "document.body.clientWidth",
    "document.body.clientHeight",
];
export function spoofsWindowDimensions(fromOptions) {
    const env = fromOptions.env ?? {};
    const chunks = Object.entries(env)
        .filter(([key]) => key.startsWith("CAMOU_CONFIG_"))
        .map(([key, value]) => [Number(key.split("_").pop()), value])
        .sort(([a], [b]) => a - b);
    if (chunks.length === 0) {
        return false;
    }
    const blob = chunks.map(([, value]) => value).join("");
    return WINDOW_DIM_KEYS.some((key) => blob.includes(key));
}
export function attachNoViewportDefault(target) {
    for (const name of ["newPage", "newContext"]) {
        const original = target[name];
        if (typeof original !== "function") {
            continue;
        }
        target[name] = (options, ...rest) => original.call(target, options && "viewport" in options
            ? options
            : { ...options, viewport: null }, ...rest);
    }
    return target;
}
export function syncAttachVD(browser, virtualDisplay) {
    if (!virtualDisplay) {
        return browser;
    }
    const originalClose = browser.close.bind(browser);
    browser.close = async (...args) => {
        try {
            return await originalClose(...args);
        }
        finally {
            if (virtualDisplay) {
                virtualDisplay.kill();
            }
        }
    };
    browser._virtualDisplay = virtualDisplay;
    return browser;
}
const FAST_STARTUP_PREFS = {
    "app.update.auto": false,
    "app.update.enabled": false,
    "browser.shell.checkDefaultBrowser": false,
    "browser.aboutwelcome.enabled": false,
    "browser.search.update": false,
    "browser.startup.homepage_override.mstone": "ignore",
    "datareporting.healthreport.uploadEnabled": false,
    "datareporting.policy.dataSubmissionEnabled": false,
    "extensions.update.enabled": false,
    "messaging-system.rsexperimentloader.enabled": false,
    "network.captive-portal-service.enabled": false,
    "toolkit.telemetry.archive.enabled": false,
    "toolkit.telemetry.enabled": false,
    "toolkit.telemetry.unified": false,
};
function getProxyUrl(proxy) {
    if (!proxy)
        return null;
    if (typeof proxy === "string") {
        return new URL(proxy);
    }
    const { server, username, password } = proxy;
    let url;
    try {
        url = new URL(server);
        if (!url.host || !url.protocol)
            url = new URL(`http://${server}`);
    }
    catch (_e) {
        url = new URL(`http://${server}`);
    }
    if (username)
        url.username = username;
    if (password)
        url.password = password;
    return url;
}
export async function launchOptions({ config, os, block_images, block_webrtc, block_webgl, disable_coop, webgl_config, geoip, humanize, locale, addons, fonts, custom_fonts_only, exclude_addons, screen, window, fingerprint, ff_version, headless, main_world_eval, executable_path, firefox_user_prefs, proxy, enable_cache, realism, args, env, i_know_what_im_doing, debug, virtual_display, hardware_concurrency_override, device_memory_override, timezone_jitter = true, perf_jitter = true, session_stickiness = true, ...launch_options }) {
    if (!config) {
        config = {};
    }
    const headlessBoolean = headless ?? false;
    if (!addons) {
        addons = [];
    }
    if (!args) {
        args = [];
    }
    if (!firefox_user_prefs) {
        firefox_user_prefs = {};
    }
    if (custom_fonts_only === undefined) {
        custom_fonts_only = false;
    }
    if (i_know_what_im_doing === undefined) {
        i_know_what_im_doing = false;
    }
    if (!env) {
        env = process.env;
    }
    if (typeof executable_path === "string") {
        executable_path = path.resolve(executable_path);
    }
    if (virtual_display) {
        env.DISPLAY = virtual_display;
    }
    if (!i_know_what_im_doing) {
        warnManualConfig(config);
    }
    const operatingSystems = validateOS(os);
    if (!operatingSystems && webgl_config) {
        throw new Error("OS must be set when using webgl_config");
    }
    const proxyUrl = getProxyUrl(proxy);
    const ipTask = geoip && typeof geoip !== "string" ? publicIP(proxyUrl?.href) : null;
    ipTask?.catch(() => { });
    if (!executable_path &&
        !getAsBooleanFromENV("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", false)) {
        await ensureCamoufoxInstalled();
    }
    await addDefaultAddons(addons, exclude_addons);
    if (addons.length > 0) {
        confirmPaths(addons);
        config.addons = addons;
    }
    let ff_version_str;
    if (ff_version) {
        ff_version_str = ff_version.toString();
        LeakWarning.warn("ff_version", i_know_what_im_doing);
    }
    else {
        ff_version_str = installedVerStr().split(".", 1)[0];
    }
    if (!fingerprint) {
        fingerprint = generateFingerprint(window, {
            operatingSystems,
        });
    }
    else {
        if (!i_know_what_im_doing) {
            checkCustomFingerprint(fingerprint);
        }
    }
    mergeInto(config, fromBrowserforge(fingerprint, ff_version_str));
    const randint = (min, max) => {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return min + (buf[0] % (max - min + 1));
    };
    const knownProperties = loadProperties(executable_path);
    for (const seed of ["fonts:spacing_seed", "audio:seed", "canvas:seed"]) {
        if (seed in knownProperties) {
            setInto(config, seed, randint(1, 4_294_967_295));
        }
    }
    const fpExtended = fingerprint;
    // Apply extended fingerprint seeds from the generated fingerprint (only if supported)
    if (fpExtended?.audioSeed !== undefined && "audio:seed" in knownProperties)
        setInto(config, "audio:seed", fpExtended.audioSeed);
    if (fpExtended?.canvasSeed !== undefined && "canvas:seed" in knownProperties)
        setInto(config, "canvas:seed", fpExtended.canvasSeed);
    if (fpExtended?.fontSpacingSeed !== undefined && "fonts:spacing_seed" in knownProperties)
        setInto(config, "fonts:spacing_seed", fpExtended.fontSpacingSeed);
    // Hardware concurrency — prefer override, then fingerprint seed, then OS-consistent default
    const hwConcurrencyPool = [2, 4, 6, 8, 10, 12, 16];
    if (hardware_concurrency_override !== undefined) {
        setInto(config, "navigator.hardwareConcurrency", hardware_concurrency_override);
    }
    else if (fpExtended?.hardwareConcurrencySeed !== undefined) {
        setInto(config, "navigator.hardwareConcurrency", fpExtended.hardwareConcurrencySeed);
    }
    else {
        setInto(config, "navigator.hardwareConcurrency", hwConcurrencyPool[randint(0, hwConcurrencyPool.length - 1)]);
    }
    // Device memory — realistic range per OS tier (only if supported)
    if ("navigator.deviceMemory" in knownProperties) {
        const memPool = [4, 6, 8];
        if (device_memory_override !== undefined) {
            setInto(config, "navigator.deviceMemory", device_memory_override);
        }
        else if (fpExtended?.memoryMultiplier !== undefined) {
            const baseMem = 8;
            setInto(config, "navigator.deviceMemory", Math.round(baseMem * fpExtended.memoryMultiplier));
        }
        else {
            setInto(config, "navigator.deviceMemory", memPool[randint(0, memPool.length - 1)]);
        }
    }
    // Timezone jitter — ±15 minutes offset for realism
    if (timezone_jitter) {
        const baseOffset = config["timezone"] ?? -Math.round(new Date().getTimezoneOffset());
        const tzJitter = randint(-15, 15);
        const totalOffset = baseOffset + tzJitter;
        setInto(config, "timezone", formatTimezoneOffset(totalOffset));
    }
    // Performance.now() jitter — simulates system clock drift (only if supported)
    if (perf_jitter && fpExtended?.perfJitter !== undefined && "performance:now_jitter" in knownProperties) {
        setInto(config, "performance:now_jitter", Math.round(fpExtended.perfJitter * 1000));
    }
    // WebGL vendor/renderer from fingerprint if available (only if supported)
    if (fpExtended?.webglVendor && fpExtended?.webglRenderer) {
        if ("webGl:vendor" in knownProperties)
            setInto(config, "webGl:vendor", fpExtended.webglVendor);
        if ("webGl:renderer" in knownProperties)
            setInto(config, "webGl:renderer", fpExtended.webglRenderer);
        if ("webgl:glslVersion" in knownProperties && fpExtended?.webglGLSL)
            setInto(config, "webgl:glslVersion", fpExtended.webglGLSL);
        if ("webgl:extensions" in knownProperties && fpExtended?.webglExtensions && Array.isArray(fpExtended.webglExtensions)) {
            setInto(config, "webgl:extensions", fpExtended.webglExtensions);
        }
    }
    // Session stickiness — makes same-session pages share certain values
    if (session_stickiness && "session:stickiness" in knownProperties) {
        setInto(config, "session:stickiness", true);
    }
    const targetOS = getTargetOS(config);
    // --- Behavioral property seeding (battery, media devices, DNT, etc.) ---
    if (fpExtended) {
        seedBehavioralProperties(config, fpExtended, targetOS, Boolean(headlessBoolean), knownProperties, firefox_user_prefs);
    }
    setInto(config, "window.history.length", weightedPick([1, 2, 3, 4, 5, 6], [40, 25, 15, 10, 6, 4]));
    if (fonts) {
        config.fonts = fonts;
    }
    if (custom_fonts_only) {
        firefox_user_prefs["gfx.bundled-fonts.activate"] = 0;
        if (fonts) {
            LeakWarning.warn("custom_fonts_only");
        }
        else {
            throw new Error("No custom fonts were passed, but `custom_fonts_only` is enabled.");
        }
    }
    else {
        updateFonts(config, targetOS);
    }
    if (geoip) {
        geoipAllowed();
        if (typeof geoip !== "string") {
            geoip = await ipTask;
        }
        if (!block_webrtc) {
            if (validIPv4(geoip)) {
                setInto(config, "webrtc:ipv4", geoip);
                firefox_user_prefs["network.dns.disableIPv6"] = true;
            }
            else if (validIPv6(geoip)) {
                setInto(config, "webrtc:ipv6", geoip);
            }
        }
        const geolocation = await getGeolocation(geoip);
        config = { ...config, ...geolocation.asConfig() };
    }
    if (proxyUrl &&
        !proxyUrl.hostname.includes("localhost") &&
        !isDomainSet(config, "geolocation:")) {
        LeakWarning.warn("proxy_without_geoip");
    }
    if (locale) {
        handleLocales(locale, config);
    }
    if (humanize) {
        setInto(config, "humanize", true);
        if (typeof humanize === "number") {
            setInto(config, "humanize:maxTime", humanize);
        }
    }
    if (main_world_eval) {
        setInto(config, "allowMainWorld", true);
    }
    if (block_images) {
        LeakWarning.warn("block_images", i_know_what_im_doing);
        firefox_user_prefs["permissions.default.image"] = 2;
    }
    if (block_webrtc) {
        firefox_user_prefs["media.peerconnection.enabled"] = false;
    }
    if (disable_coop) {
        LeakWarning.warn("disable_coop", i_know_what_im_doing);
        firefox_user_prefs["browser.tabs.remote.useCrossOriginOpenerPolicy"] =
            false;
    }
    if (block_webgl || launch_options.allow_webgl === false) {
        firefox_user_prefs["webgl.disabled"] = true;
        LeakWarning.warn("block_webgl", i_know_what_im_doing);
    }
    else {
        let webgl_fp;
        if (webgl_config) {
            webgl_fp = await sampleWebGL(targetOS, ...webgl_config);
        }
        else {
            webgl_fp = await sampleWebGL(targetOS);
        }
        const { webGl2Enabled, ...webGlConfig } = webgl_fp;
        mergeInto(config, reconcileWebglKeys(webGlConfig, knownProperties));
        mergeInto(firefox_user_prefs, {
            "webgl.enable-webgl2": webGl2Enabled ?? true,
            "webgl.force-enabled": true,
        });
    }
    mergeInto(config, {
        "canvas:aaOffset": cryptoRandInt(0, 100) - 50,
        "canvas:aaCapOffset": true,
    });
    const dprPool = DPR_POOLS[targetOS] ?? DPR_POOLS.lin;
    if (!screen && !window) {
        snapScreen(config, dprPool);
    }
    const screenW = Number(config["screen.width"]);
    const screenH = Number(config["screen.height"]);
    const [dprValues, dprWeights] = screenW > 0 && screenH > 0
        ? coherentDprWeights(dprPool, screenW, screenH)
        : [dprPool.map(([v]) => v), dprPool.map(([, w]) => w)];
    const dpr = weightedPick(dprValues, dprWeights);
    setInto(config, "window.devicePixelRatio", dpr);
    // Respect user-requested screen size constraints (CSS pixels, not physical)
    if (screen && typeof screen === "object") {
        const maxW = Number(screen.maxWidth);
        const maxH = Number(screen.maxHeight);
        if (Number.isFinite(maxW) && maxW > 0) {
            config["screen.width"] = Math.min(config["screen.width"], maxW * dpr);
            config["screen.availWidth"] = Math.min(config["screen.availWidth"], maxW * dpr);
        }
        if (Number.isFinite(maxH) && maxH > 0) {
            config["screen.height"] = Math.min(config["screen.height"], maxH * dpr);
            config["screen.availHeight"] = Math.min(config["screen.availHeight"], maxH * dpr);
        }
    }
    if (realism) {
        for (const [key, value] of Object.entries(realismDefaults(knownProperties))) {
            setInto(config, key, value);
        }
        const language = config["locale:language"];
        const region = config["locale:region"];
        if (!("locale:all" in config) &&
            typeof language === "string" &&
            typeof region === "string") {
            config["locale:all"] = languageList(language, region);
        }
    }
    if (enable_cache) {
        mergeInto(firefox_user_prefs, CACHE_PREFS);
    }
    if (debug) {
        console.debug("[DEBUG] Config:");
        console.debug(config);
    }
    validateConfig(config, knownProperties);
    const env_vars = {
        ...getEnvVars(config, targetOS),
        ...env,
    };
    if (executable_path) {
        executable_path = executable_path.toString();
    }
    else {
        executable_path = launchPath();
    }
    const out = {
        executablePath: executable_path,
        args: args,
        env: env_vars,
        firefoxUserPrefs: { ...FAST_STARTUP_PREFS, ...firefox_user_prefs },
        proxy: proxyUrl
            ? {
                server: proxyUrl.origin,
                username: proxyUrl.username,
                password: proxyUrl.password,
                bypass: typeof proxy === "string" ? undefined : proxy?.bypass,
            }
            : undefined,
        headless: headlessBoolean,
        ...launch_options,
    };
    return out;
}
