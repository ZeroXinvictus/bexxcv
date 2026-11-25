import { onEachPage } from "./pagehooks.js";
import { between, sleep } from "./random.js";
import { Human } from "./human.js";
const CHALLENGE_TITLES = [
    "just a moment",
    "tunggu sebentar",
    "attention required",
    "security check",
    "un instant",
    "einen moment",
    "один момент",
    "um momento",
    "un momento",
];
const WATCHED = new WeakSet();
const BUSY = new WeakSet();
// --- Helpers -----------------------------------------------------------------
async function cookieValue(page, name) {
    try {
        const url = page.url();
        if (!url || url === "about:blank")
            return null;
        const cookies = await page.context().cookies(url);
        return cookies.find((c) => c.name === name)?.value ?? null;
    }
    catch {
        return null;
    }
}
export async function isChallenge(page) {
    const title = (await page.title().catch(() => "")).toLowerCase();
    return CHALLENGE_TITLES.some((t) => title.includes(t));
}
export async function humanActivity(page, scale = 1) {
    const view = page.viewportSize();
    const opts = { speed: scale < 1 ? 0.4 : 1 };
    const actor = new Human(page, opts);
    await actor.idle(Math.round(800 * (2 - scale)));
    for (let i = 0; i < Math.max(1, Math.floor(2 * scale)); i++) {
        await actor.scroll(between(60, 180));
    }
}
// --- Main wait loop ----------------------------------------------------------
/**
 * Waits until a `cf_clearance` cookie is present for the current page origin.
 * If a challenge page was seen, performs light human-like activity while
 * polling — matching the strategy used by cf-clearance-scraper.
 */
export async function waitForUam(page, options = {}) {
    const timeout = options.timeout ?? 30000;
    const start = Date.now();
    let challenged = false;
    let consecutiveMisses = 0;
    while (Date.now() - start < timeout && !page.isClosed()) {
        const cookie = await cookieValue(page, "cf_clearance");
        // Cookie present — done
        if (cookie) {
            return { challenged, bypassed: true, cookie };
        }
        // Detect whether we're currently on a challenge page
        const challenging = await isChallenge(page);
        if (challenging) {
            challenged = true;
            // Give the external assist callback a chance to interact
            if (options.assist) {
                const acted = await options.assist(page).catch(() => false);
                if (acted) {
                    consecutiveMisses = 0;
                    await sleep(2000);
                    continue;
                }
            }
            // Light human activity while waiting for the JS challenge to complete
            try {
                await humanActivity(page, 0.5);
            }
            catch {
                await sleep(500);
            }
            await sleep(1500);
            continue;
        }
        // Not challenged but no cookie yet — could be mid-navigation or still loading
        if (!challenged) {
            return { challenged: false, bypassed: false, cookie: null };
        }
        // Challenged before but cookie still missing after repeated polls
        consecutiveMisses++;
        if (consecutiveMisses > 8) {
            return { challenged: true, bypassed: true, cookie: null };
        }
        await sleep(1000);
    }
    return { challenged, bypassed: false, cookie: null };
}
// --- Watcher -----------------------------------------------------------------
async function runWait(page, options) {
    if (BUSY.has(page))
        return undefined;
    BUSY.add(page);
    try {
        return await waitForUam(page, options);
    }
    finally {
        BUSY.delete(page);
    }
}
export function watchUam(page, options = {}) {
    if (WATCHED.has(page))
        return;
    WATCHED.add(page);
    const interval = options.interval ?? 1500;
    const timeout = options.timeout ?? 30000;
    const waitOnGoto = options.waitOnGoto ?? true;
    if (waitOnGoto) {
        const originalGoto = page.goto.bind(page);
        page.goto = (async (...args) => {
            const response = await originalGoto(...args);
            const began = Date.now();
            while (BUSY.has(page) && Date.now() - began < timeout) {
                await sleep(200);
            }
            await runWait(page, options).catch(() => undefined);
            return response;
        });
    }
    let active = true;
    page.on("close", () => {
        active = false;
    });
    const loop = async () => {
        while (active && !page.isClosed()) {
            try {
                if (!BUSY.has(page) && (await isChallenge(page))) {
                    await runWait(page, options);
                }
            }
            catch {
                await sleep(500);
            }
            await sleep(interval);
        }
    };
    void loop();
}
export function attachUam(target, options = {}) {
    return onEachPage(target, (page) => watchUam(page, options));
}
