import { initSession, advancePage, endSession, getSessionId } from "./session.js";
const DEFAULT_MIN_MS = 800;
const DEFAULT_MAX_MS = 3_000;
const DEFAULT_TIMEOUT = 1_800_000;
function ensureOpts(opts) {
    return {
        pageTransitionMinMs: opts.pageTransitionMinMs ?? DEFAULT_MIN_MS,
        pageTransitionMaxMs: opts.pageTransitionMaxMs ?? DEFAULT_MAX_MS,
        sessionTimeout: opts.sessionTimeout ?? DEFAULT_TIMEOUT,
        ...opts,
    };
}
function cryptoRandBetween(min, max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return min + (buf[0] / 0x100000000) * (max - min);
}
function cryptoGauss(seed, index, mean, sd) {
    let hash = 0x9e3779b9;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed[i]) >>> 0;
    }
    hash = (hash + index * 0x5bd1e995) >>> 0;
    const u1 = Math.max((hash >>> 0) / 0x100000000, 1e-10);
    const nextHash = (hash ^ 0x9e3779b9) >>> 0;
    const u2 = nextHash / 0x100000000;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + sd * z;
}
function createSession(page, opts) {
    if (!getSessionId(page)) {
        initSession(page, { timeout: opts.sessionTimeout });
    }
}
function getPageDelay(page, opts) {
    const resolved = ensureOpts(opts);
    const state = page._bexxcv_session;
    if (!state)
        return cryptoRandBetween(resolved.pageTransitionMinMs, resolved.pageTransitionMaxMs);
    const elapsed = Date.now() - state.createdAt;
    const progress = Math.min(elapsed / resolved.sessionTimeout, 1);
    const baseDelay = cryptoRandBetween(resolved.pageTransitionMinMs, resolved.pageTransitionMaxMs);
    const fatigueFactor = 1 + progress * 0.5;
    return baseDelay * fatigueFactor;
}
export function attachHumanBehavior(page, options = {}) {
    const opts = ensureOpts(options);
    createSession(page, opts);
    page._bexxcv_human_options = opts;
    const originalGoto = page.goto.bind(page);
    page.goto = async (...args) => {
        const delay = getPageDelay(page, opts);
        await sleep(cryptoRandBetween(delay * 0.3, delay));
        const result = await originalGoto(...args);
        advancePage(page);
        return result;
    };
    const originalClick = page.click.bind(page);
    page.click = async (selector, ...args) => {
        await sleep(cryptoRandBetween(120, 400));
        return originalClick(selector, ...args);
    };
    const originalEvaluate = page.evaluate.bind(page);
    page.evaluate = async (pageFunction, ...evalArgs) => {
        if (opts.idleDrift) {
            const view = await page.viewportSize();
            if (view) {
                const state = page._bexxcv_session;
                const seed = state?.seedBuffer ?? new Uint8Array(32);
                const timeIndex = Date.now() % 1000;
                const driftX = cryptoGauss(seed, timeIndex, view.width / 2, view.width * 0.15);
                const driftY = cryptoGauss(seed, timeIndex + 1, view.height / 2, view.height * 0.1);
                await page.mouse.move(Math.max(0, Math.min(view.width, driftX)), Math.max(0, Math.min(view.height, driftY)));
            }
        }
        return originalEvaluate(pageFunction, ...evalArgs);
    };
}
export function detachHumanBehavior(page) {
    const sessionState = page._bexxcv_session;
    if (sessionState) {
        endSession(page);
    }
    delete page._bexxcv_human_options;
    const origGoto = page._orig_goto;
    const origClick = page._orig_click;
    const origEval = page._orig_evaluate;
    if (origGoto)
        page.goto = origGoto;
    if (origClick)
        page.click = origClick;
    if (origEval)
        page.evaluate = origEval;
}
export function getSessionInfo(page) {
    const state = page._bexxcv_session;
    if (!state)
        return null;
    return {
        id: getSessionId(page),
        pageCount: state.pageCount,
        ageMs: Date.now() - state.createdAt,
    };
}
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}
