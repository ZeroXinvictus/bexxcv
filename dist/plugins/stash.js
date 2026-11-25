import * as fs from "node:fs";
import * as path from "node:path";
function domainKey(cookie) {
    return cookie.domain.replace(/^\./, "").toLowerCase();
}
function expired(cookie) {
    return cookie.expires > 0 && cookie.expires < Date.now() / 1000;
}
function readFile(file) {
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (raw && typeof raw === "object" && raw.domains)
            return raw;
    }
    catch {
        return { version: 1, saved: new Date(0).toISOString(), domains: {} };
    }
    return { version: 1, saved: new Date(0).toISOString(), domains: {} };
}
export function stash(input) {
    const options = typeof input === "string" ? { file: input } : input;
    const file = path.resolve(options.file);
    const names = options.names ? new Set(options.names) : null;
    const domains = options.domains?.map((d) => d.toLowerCase().replace(/^\./, "")) ?? null;
    const known = new Set();
    let timer = null;
    let launchProxy = "direct";
    const contextProxy = new WeakMap();
    const wanted = (cookie) => {
        if (names && !names.has(cookie.name))
            return false;
        if (domains) {
            const key = domainKey(cookie);
            if (!domains.some((d) => key === d || key.endsWith(`.${d}`)))
                return false;
        }
        return true;
    };
    const BOUND = new Set(["cf_clearance"]);
    const save = async (contexts) => {
        const data = readFile(file);
        for (const context of contexts) {
            const grouped = {};
            for (const cookie of await context.cookies()) {
                if (!wanted(cookie) || expired(cookie))
                    continue;
                (grouped[domainKey(cookie)] ??= []).push(cookie);
            }
            for (const [key, list] of Object.entries(grouped)) {
                data.domains[key] = list;
                (data.bound ??= {})[key] = contextProxy.get(context) ?? launchProxy;
            }
        }
        for (const [key, list] of Object.entries(data.domains)) {
            const alive = list.filter((cookie) => !expired(cookie));
            if (alive.length > 0)
                data.domains[key] = alive;
            else
                delete data.domains[key];
        }
        data.saved = new Date().toISOString();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    };
    return {
        name: "stash",
        order: 20,
        beforeLaunch(launch) {
            const proxy = launch.proxy;
            if (typeof proxy === "string")
                launchProxy = proxy;
            else if (proxy && proxy.server)
                launchProxy = proxy.server;
        },
        async onContext(context, contextOptions) {
            known.add(context);
            const current = contextOptions.proxy?.server ?? launchProxy;
            contextProxy.set(context, current);
            const data = readFile(file);
            const cookies = Object.entries(data.domains).flatMap(([key, list]) => list.filter((cookie) => {
                if (!wanted(cookie) || expired(cookie))
                    return false;
                if (BOUND.has(cookie.name) && (data.bound?.[key] ?? "direct") !== current)
                    return false;
                return true;
            }));
            if (cookies.length > 0) {
                try {
                    await context.addCookies(cookies);
                }
                catch (error) {
                    console.warn(`[bexxcv] stash could not load cookies: ${error.message}`);
                }
            }
            if (options.saveEvery && !timer) {
                timer = setInterval(() => {
                    void save([...known]).catch(() => undefined);
                }, options.saveEvery);
                timer.unref();
            }
        },
        async beforeClose(contexts) {
            if (timer)
                clearInterval(timer);
            timer = null;
            await save(contexts);
        },
    };
}
