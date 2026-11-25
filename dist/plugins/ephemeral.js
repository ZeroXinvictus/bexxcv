const CONTEXT_DATA = new WeakMap();
const PAGE_LAST_URL = new WeakMap();
const WATCHED = new WeakSet();
function getContextStore(context) {
    let store = CONTEXT_DATA.get(context);
    if (!store) {
        store = new Map();
        CONTEXT_DATA.set(context, store);
    }
    return store;
}
async function extractEphemeralId(page) {
    try {
        const result = await page.evaluate(() => {
            try {
                const w = window;
                const resp = w.turnstile?.getResponse?.();
                if (!resp || resp.length < 20)
                    return null;
                // Ephemeral id is embedded as ?ephemeral_id=<hex> inside the response querystring
                const m = resp.match(/ephemeral_id=([A-Za-z0-9_-]+)/);
                return m?.[1] ?? null;
            }
            catch {
                return null;
            }
        });
        return result ?? null;
    }
    catch {
        return null;
    }
}
async function readToken(page) {
    return page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll('[name="cf-turnstile-response"]'))) {
            if (el.value && el.value.length > 20)
                return el.value;
        }
        return null;
    }).catch(() => null);
}
export function ephemeral(options = {}) {
    const maxAge = options.maxAgeMs ?? 600_000; // 10 min
    const autoReplay = options.autoReplay ?? false;
    return {
        name: "ephemeral",
        order: 44,
        onContext(context) {
            const store = getContextStore(context);
            // Prune stale entries every minute
            const prune = setInterval(() => {
                const now = Date.now();
                for (const [key, entry] of store.entries()) {
                    if (entry.expiresAt < now)
                        store.delete(key);
                }
            }, 60_000);
            prune.unref();
        },
        onPage(page) {
            if (WATCHED.has(page))
                return;
            WATCHED.add(page);
            const originalGoto = page.goto.bind(page);
            page.goto = (async (...args) => {
                const url = String(args[0]);
                // Before navigating, try to replay stored ephemeral_id into hidden input
                if (autoReplay) {
                    const prev = PAGE_LAST_URL.get(page);
                    if (prev && prev !== url) {
                        // Different page — clear stale data
                        const store = getContextStore(page.context());
                        const now = Date.now();
                        for (const [key, e] of store.entries()) {
                            if (e.expiresAt < now)
                                store.delete(key);
                        }
                    }
                }
                PAGE_LAST_URL.set(page, url);
                return originalGoto(...args);
            });
            // Watch for new tokens and capture ephemeral ids
            page.on("load", async () => {
                try {
                    const token = await readToken(page);
                    if (!token)
                        return;
                    const eid = await extractEphemeralId(page);
                    if (!eid)
                        return;
                    const key = `${page.url()}:${eid.slice(0, 8)}`;
                    getContextStore(page.context()).set(key, {
                        widgetKey: key,
                        ephemeralId: eid,
                        expiresAt: Date.now() + maxAge,
                    });
                }
                catch {
                    // ignore
                }
            });
        },
    };
}
/** Retrieve stored ephemeral entries for a context. */
export function getEphemeralEntries(context) {
    const store = CONTEXT_DATA.get(context) ?? new Map();
    return [...store.values()].filter((e) => e.expiresAt > Date.now());
}
/** Inject a stored ephemeral_id back into a hidden input on the target page. */
export async function replayEphemeral(page, ephemeralId) {
    try {
        await page.evaluate((id) => {
            const input = document.querySelector('input[name="cf-turnstile-response"]');
            if (!input)
                return false;
            input.dataset.ephemeralRef = id;
            return true;
        }, ephemeralId);
        return true;
    }
    catch {
        return false;
    }
}
export function attachEphemeral(target, options = {}) {
    void ephemeral(options); // side-effect plugin registration handled by applyPlugins
    return target;
}
