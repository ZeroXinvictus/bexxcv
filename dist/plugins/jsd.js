import { sleep } from "../random.js";
const JSD_READY = new WeakSet();
const WATCHED = new WeakSet();
async function isJsdPage(page) {
    try {
        const title = (await page.title().catch(() => "")).toLowerCase();
        if (title.includes("just a moment") || title.includes("attention required")) {
            return true;
        }
        const hasJsd = await page.evaluate(() => {
            try {
                const w = window;
                if (!w?.cloudflare?.jsd)
                    return false;
                // If it's our fallback (bexxcv), not a real CF challenge
                if (w.cloudflare.jsd._bexxcv)
                    return false;
                // Real CF JSD has state "pending" or a registered executeOnce
                return w.cloudflare.jsd.state === "pending" || typeof w.cloudflare.jsd.executeOnce === "function";
            }
            catch {
                return false;
            }
        }).catch(() => false);
        return hasJsd;
    }
    catch {
        return false;
    }
}
async function waitForJsdCompletion(page, options) {
    const timeout = options.timeout ?? 15_000;
    const interval = options.interval ?? 500;
    const start = Date.now();
    while (Date.now() - start < timeout && !page.isClosed()) {
        try {
            const passed = await page.evaluate(() => {
                try {
                    const w = window;
                    if (!w?.cloudflare?.jsd?.state)
                        return null;
                    return w.cloudflare.jsd.state === "passed" ? true : null;
                }
                catch {
                    return null;
                }
            }).catch(() => null);
            if (passed === true) {
                return { passed: true };
            }
            // Also check if cf_clearance appeared (indicates JSD completed externally)
            const cookies = await page.context().cookies(page.url()).catch(() => []);
            if (cookies.some((c) => c.name === "cf_clearance")) {
                return { passed: true };
            }
        }
        catch {
            // ignore evaluation errors
        }
        await sleep(interval);
    }
    return { passed: false };
}
export function jsd(options = {}) {
    const timeout = options.timeout ?? 15_000;
    const interval = options.interval ?? 500;
    return {
        name: "jsd",
        order: 43,
        onPage(page) {
            if (WATCHED.has(page))
                return;
            WATCHED.add(page);
            // Inject a fallback cloudflare.jsd namespace so page JS doesn't crash
            void page.addInitScript(() => {
                if (typeof window === "undefined")
                    return;
                const w = window;
                if (!w.cloudflare)
                    w.cloudflare = {};
                const cf = w.cloudflare;
                if (!cf.jsd) {
                    cf.jsd = {
                        state: "pending",
                        executeOnce(_opts = {}) { },
                        _bexxcv: true,
                    };
                }
                const _jsd = cf.jsd;
                _jsd &&
                    Object.assign(cf.jsd, {
                        executeOnce: function (opts = {}) {
                            if (opts.callback) {
                                setTimeout(() => opts.callback("success"), 0);
                            }
                            return { then: (cb) => setTimeout(cb, 0) };
                        },
                    });
            });
            const originalGoto = page.goto.bind(page);
            page.goto = (async (...args) => {
                JSD_READY.delete(page);
                const response = await originalGoto(...args);
                // If we landed on a JSD page, wait for it to complete
                const challenging = await isJsdPage(page).catch(() => false);
                if (challenging) {
                    const result = await waitForJsdCompletion(page, { timeout, interval }).catch(() => ({ passed: false }));
                    if (result.passed) {
                        JSD_READY.add(page);
                    }
                    else {
                        console.warn(`[bexxcv] jsd: challenge did not complete within ${timeout}ms`);
                    }
                }
                return response;
            });
        },
    };
}
/** Check whether the current page has passed its JSD challenge. */
export async function isJsdPassed(page) {
    if (JSD_READY.has(page))
        return true;
    const passed = await page.evaluate(() => {
        try {
            const w = window;
            return w?.cloudflare?.jsd?.state === "passed";
        }
        catch {
            return false;
        }
    }).catch(() => false);
    if (passed)
        JSD_READY.add(page);
    return passed;
}
/** Attach JSD handling to an existing browser or context. */
export function attachJsd(target, _options = {}) {
    void jsd(_options);
    return target;
}
