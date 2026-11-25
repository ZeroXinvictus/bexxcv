import { publicIP } from "../ip.js";
export function toProxyConfig(url) {
    const parsed = new URL(url);
    const config = { server: `${parsed.protocol}//${parsed.host}` };
    if (parsed.username)
        config.username = decodeURIComponent(parsed.username);
    if (parsed.password)
        config.password = decodeURIComponent(parsed.password);
    return config;
}
function timeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
export function dodge(input) {
    const options = Array.isArray(input) ? { pool: input } : input;
    if (!options.pool || options.pool.length === 0) {
        throw new Error("dodge needs at least one proxy in pool");
    }
    const rotateOn = new Set(options.rotateOn ?? [403, 429]);
    const cooldown = options.cooldown ?? 300_000;
    const states = options.pool.map((url) => ({ url, badUntil: 0 }));
    const owners = new WeakMap();
    let cursor = 0;
    let launchProxy = null;
    let firstContext = true;
    const pick = () => {
        const now = Date.now();
        for (let i = 0; i < states.length; i++) {
            const state = states[(cursor + i) % states.length];
            if (state.badUntil <= now) {
                cursor = (cursor + i + 1) % states.length;
                return state;
            }
        }
        const soonest = [...states].sort((a, b) => a.badUntil - b.badUntil)[0];
        console.warn("[bexxcv] dodge: every proxy is cooling down, reusing the one that recovers first");
        return soonest;
    };
    return {
        name: "dodge",
        order: 10,
        async beforeLaunch(launch) {
            if (options.healthCheck !== false) {
                const limit = options.healthTimeout ?? 10_000;
                const healthResults = await Promise.allSettled(states.map(async (state, index) => {
                    try {
                        state.ip = await timeout(publicIP(state.url), limit);
                        return { index, healthy: true };
                    }
                    catch {
                        state.badUntil = Date.now() + cooldown;
                        return { index, healthy: false };
                    }
                }));
                const hasHealthy = healthResults.some((r) => r.status === "fulfilled" && r.value.healthy);
                if (!hasHealthy) {
                    throw new Error("dodge: no healthy proxy in pool");
                }
            }
            const chosen = pick();
            launchProxy = chosen.url;
            if (launch.proxy === undefined)
                launch.proxy = toProxyConfig(chosen.url);
        },
        beforeContext(contextOptions) {
            if (contextOptions.proxy)
                return;
            if (firstContext) {
                firstContext = false;
                return;
            }
            const chosen = pick();
            contextOptions.proxy = toProxyConfig(chosen.url);
        },
        onContext(context, contextOptions) {
            const server = contextOptions.proxy?.server;
            const owner = states.find((state) => server && state.url.includes(new URL(state.url).host) && state.url.startsWith(server.split("//")[0]))?.url ??
                launchProxy;
            if (owner)
                owners.set(context, owner);
            context.on("response", (response) => {
                const status = response.status();
                if (!rotateOn.has(status))
                    return;
                if (!response.request().isNavigationRequest())
                    return;
                const proxy = owners.get(context);
                const state = states.find((s) => s.url === proxy);
                if (!state)
                    return;
                state.badUntil = Date.now() + cooldown;
                options.onBlocked?.({ proxy: state.url, status, url: response.url() });
                console.warn(`[bexxcv] dodge: proxy answered ${status}, it is paused for ${Math.round(cooldown / 1000)}s. New contexts will use another proxy.`);
            });
        },
    };
}
