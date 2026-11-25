import { FingerprintGenerator, } from "fingerprint-generator";
import BROWSERFORGE_DATA from "./mappings/browserforge.config.js";
import { sampleGPUProfile, resolveUAOS } from "./webgl/profiles.js";
export const SUPPORTED_OS = ["linux", "macos", "windows"];
const FP_GENERATOR = new FingerprintGenerator({
    browsers: ["firefox"],
    operatingSystems: SUPPORTED_OS,
});
export function cryptoRandInt(min, max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return min + (buf[0] % (max - min + 1));
}
export function cryptoFloat() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 0x100000000;
}
// Realistic font lists per OS — these are actual system fonts, not random strings
const REALISTIC_FONTS = {
    win: [
        "Arial", "Arial Black", "Calibri", "Cambria", "Cambria Math", "Comic Sans MS",
        "Consolas", "Courier New", "Georgia", "Impact", "Segoe UI", "Times New Roman",
        "Trebuchet MS", "Verdana", "Microsoft YaHei", "Microsoft JhengHei",
    ],
    mac: [
        "Apple SD Gothic Neo", "Avenir", "Baskerville", "Big Caslon", "Chalkboard",
        "Chalkboard SE", "Chiara Head", "Colorado", "Didot", "Futura", "Geneva",
        "Gill Sans", "Helvetica", "Helvetica Neue", "Hiragino Kaku Gothic Pro",
        "Hiragino Maru Gothic Pro", "Menlo", "Mukta Mahee", "MV Boli", "Noto Sans",
        "Palatino", "San Francisco", "STHeiti", "Symbol", "Tahoma", "Thonburi",
        "Times", "Trattatello", "Zapfino",
    ],
    lin: [
        "Arial", "Cantarell", "Comfortaa", "DejaVu Sans", "DejaVu Sans Mono",
        "Fira Code", "Fira Sans", "Google Sans", "Iosevka", "Liberation Mono",
        "Liberation Sans", "Liberation Serif", "Monospace", "Noto Color Emoji",
        "Noto Sans", "Noto Sans CJK", "Roboto", "Source Code Pro", "Ubuntu",
        "Ubuntu Condensed", "Ubuntu Mono",
    ],
};
// Realistic canvas noise patterns that match GPU output characteristics
const CANVAS_NOISE_PATTERNS = [
    { type: "gaussian", sigma: 0.5 },
    { type: "gaussian", sigma: 1.0 },
    { type: "poisson", rate: 0.3 },
    { type: "saltPepper", density: 0.02 },
    { type: "none" }, // clean renderers exist too
];
// Subtle timing variations that differ by GPU class
const RENDER_TIME_VARIATIONS = {
    Intel: { minMs: 8, maxMs: 18 },
    NVIDIA: { minMs: 3, maxMs: 8 },
    AMD: { minMs: 4, maxMs: 10 },
    Mesa: { minMs: 15, maxMs: 35 },
    Apple: { minMs: 5, maxMs: 12 },
    Microsoft: { minMs: 20, maxMs: 50 },
    Mozilla: { minMs: 10, maxMs: 20 },
    Google: { minMs: 6, maxMs: 14 },
};
function pickWeighted(items, weights) {
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
function _castToProperties(camoufoxData, castEnum, bfDict, ffVersion) {
    for (let [key, data] of Object.entries(bfDict)) {
        if (!data)
            continue;
        const typeKey = castEnum[key];
        if (!typeKey)
            continue;
        if (typeof data === "object" && !Array.isArray(data)) {
            _castToProperties(camoufoxData, typeKey, data, ffVersion);
            continue;
        }
        if (typeKey.startsWith("screen.") && typeof data === "number" && data < 0) {
            data = 0;
        }
        if (ffVersion && typeof data === "string") {
            data = data.replaceAll(/(?<!\d)(1[0-9]{2})(\.0)(?!\d)/gi, `${ffVersion}$2`);
        }
        camoufoxData[typeKey] = data;
    }
}
function handleScreenXY(camoufoxData, fpScreen) {
    if ("window.screenY" in camoufoxData)
        return;
    const screenX = fpScreen.screenX;
    if (!screenX) {
        camoufoxData["window.screenX"] = 0;
        camoufoxData["window.screenY"] = 0;
        return;
    }
    if (screenX >= -50 && screenX <= 50) {
        camoufoxData["window.screenY"] = screenX;
        return;
    }
    const screenY = fpScreen.availHeight - fpScreen.outerHeight;
    if (screenY === 0) {
        camoufoxData["window.screenY"] = 0;
    }
    else if (screenY > 0) {
        camoufoxData["window.screenY"] = cryptoRandInt(0, screenY);
    }
    else {
        camoufoxData["window.screenY"] = cryptoRandInt(screenY, 0);
    }
}
function applyRealismSeeds(fp, ua) {
    const os = resolveUAOS(ua);
    const gpu = sampleGPUProfile(os);
    // Core audio/canvas/font seeds
    fp.audioSeed = cryptoRandInt(1, 4_294_967_295);
    fp.canvasSeed = cryptoRandInt(1, 4_294_967_295);
    fp.fontSpacingSeed = cryptoRandInt(1, 4_294_967_295);
    fp.webglVendor = gpu.vendor;
    fp.webglRenderer = gpu.renderer;
    fp.webglGLSL = gpu.glslVersion;
    fp.webglExtensions = gpu.webglExtensions;
    // Performance timing jitter based on GPU class
    const perfRange = RENDER_TIME_VARIATIONS[gpu.vendor] ?? { minMs: 5, maxMs: 20 };
    fp.perfJitter = (cryptoFloat() - 0.5) * (perfRange.maxMs - perfRange.minMs);
    // Timezone offset jitter (±15 min)
    fp.timezoneOffsetJitter = cryptoRandInt(-15, 15) * 60; // in seconds
    // Memory multiplier (0.85–1.15x base)
    fp.memoryMultiplier = 0.85 + cryptoFloat() * 0.3;
    // Hardware concurrency from realistic pool
    const possibleCores = [2, 4, 6, 8, 10, 12, 16, 20, 24];
    fp.hardwareConcurrencySeed = possibleCores[cryptoRandInt(0, possibleCores.length - 1)];
    // Touch support correlates with device type (more common on mobile/tablets)
    const touchChance = os === "win" ? 0.15 : os === "mac" ? 0.05 : 0.02;
    fp.touchSupport = cryptoFloat() < touchChance;
    fp.touchPoints = fp.touchSupport ? cryptoRandInt(1, 5) : 0;
    // Pointer type consistency — desktop has mouse, touch devices have pointer+touch
    if (fp.touchSupport) {
        fp.pointerType = cryptoFloat() < 0.3 ? "touch" : "mouse";
    }
    else {
        fp.pointerType = cryptoFloat() < 0.05 ? "pen" : "mouse";
    }
    // Online state is almost always true for real browsers
    fp.onlineState = cryptoFloat() > 0.001;
}
export function generateFingerprint(window, config) {
    let fp;
    if (window) {
        const generated = FP_GENERATOR.getFingerprint(config);
        fp = generated.fingerprint;
        handleWindowSize(fp, window[0], window[1]);
    }
    else {
        const generated = FP_GENERATOR.getFingerprint(config);
        fp = generated.fingerprint;
    }
    const ua = fp.navigator?.userAgent ?? "";
    if (ua) {
        applyRealismSeeds(fp, ua);
    }
    return fp;
}
function handleWindowSize(fp, outerWidth, outerHeight) {
    const sc = { ...fp.screen, screenY: undefined };
    const centerX = Math.floor((sc.width - outerWidth) / 2);
    const jitterX = Math.floor((cryptoFloat() - 0.5) * 40);
    sc.screenX += Math.max(0, Math.min(sc.width - outerWidth, centerX + jitterX));
    const availY = Math.max(0, sc.height - outerHeight - 40);
    sc.screenY = Math.floor(cryptoFloat() * availY * 0.45);
    if (sc.innerWidth) {
        sc.innerWidth = Math.max(outerWidth - sc.outerWidth + sc.innerWidth, 0);
    }
    if (sc.innerHeight) {
        sc.innerHeight = Math.max(outerHeight - sc.outerHeight + sc.innerHeight, 0);
    }
    sc.outerWidth = outerWidth;
    sc.outerHeight = outerHeight;
    fp.screen = sc;
}
export function fromBrowserforge(fingerprint, ffVersion) {
    const camoufoxData = {};
    _castToProperties(camoufoxData, BROWSERFORGE_DATA, { ...fingerprint }, ffVersion);
    handleScreenXY(camoufoxData, fingerprint.screen);
    return camoufoxData;
}
/**
 * Returns a realistic font list for the given OS.
 * These are actual system fonts that would appear on that platform.
 */
export function getRealisticFonts(os) {
    const key = os.toLowerCase();
    return REALISTIC_FONTS[key] ?? REALISTIC_FONTS.lin;
}
