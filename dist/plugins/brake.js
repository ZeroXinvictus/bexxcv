import { sleep } from "../random.js";
const WRAPPED = new WeakSet();
function hostOf(url, perHost) {
    if (!perHost)
        return "*";
    try {
        return new URL(url).host;
    }
    catch {
        return "*";
    }
}
function parseRetryAfter(value) {
    if (!value)
        return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds))
        return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
/** Count consecutive 403s per host — useful for detecting repeated CF blocks. */
const CONSECUTIVE_403 = new Map();
export function brake(options = {}) {
    const interval = 1000 / (options.maxRps ?? 2);
    const respect = options.respectRetryAfter ?? true;
    const perHost = options.perHost ?? true;
    const maxBackoff = options.maxBackoff ?? 120_000;
    const respectCf403 = options.respectCf403 ?? true;
    const nextSlot = new Map();
    const blockedUntil = new Map();
    const backoff = new Map();
    const take = async (host) => {
        const blocked = (blockedUntil.get(host) ?? 0) - Date.now();
        if (blocked > 0)
            await sleep(blocked);
        const at = Math.max(Date.now(), nextSlot.get(host) ?? 0);
        nextSlot.set(host, at + interval);
        const wait = at - Date.now();
        if (wait > 0)
            await sleep(wait);
    };
    return {
        name: "brake",
        order: 90,
        onContext(context) {
            context.on("response", (response) => {
                const request = response.request();
                if (!request.isNavigationRequest())
                    return;
                const host = hostOf(response.url(), perHost);
                const status = response.status();
                const headers = response.headers();
                // Rate limit: 429 / 503
                if (status === 429 || status === 503) {
                    const header = respect
                        ? parseRetryAfter(headers["retry-after"])
                        : null;
                    const next = Math.min(maxBackoff, (backoff.get(host) ?? 1000) * 2);
                    backoff.set(host, next);
                    blockedUntil.set(host, Date.now() + Math.min(maxBackoff, header ?? next));
                    CONSECUTIVE_403.delete(host);
                    return;
                }
                // Cloudflare 403 with cf-ray → likely a bot block, apply exponential backoff
                if (respectCf403 && status === 403 && headers["cf-ray"]) {
                    const prev = CONSECUTIVE_403.get(host) ?? 0;
                    const count = prev + 1;
                    CONSECUTIVE_403.set(host, count);
                    if (count >= 2) {
                        // Second+ 403: longer backoff, may need fresh clearance
                        const penalty = Math.min(maxBackoff, 5_000 * count);
                        blockedUntil.set(host, Date.now() + penalty);
                        console.warn(`[bexxcv] brake: Cloudflare 403 detected on ${host} (consecutive: ${count}). ` +
                            `Backing off ${penalty}ms. Consider rotating proxy or clearing cookies.`);
                    }
                    return;
                }
                // Successful response clears counters
                if (status < 400) {
                    backoff.delete(host);
                    CONSECUTIVE_403.delete(host);
                }
            });
        },
        onPage(page) {
            if (WRAPPED.has(page))
                return;
            WRAPPED.add(page);
            const originalGoto = page.goto.bind(page);
            page.goto = (async (...args) => {
                await take(hostOf(String(args[0]), perHost));
                return originalGoto(...args);
            });
        },
    };
}
/** Get the current consecutive-403 counter for a host. */
export function getConsecutive403(host) {
    return CONSECUTIVE_403.get(host) ?? 0;
}
