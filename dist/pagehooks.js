export async function onEachContext(target, hooks) {
    if (typeof target.newContext !== "function") {
        await hooks.after?.(target, {});
        return target;
    }
    const browser = target;
    for (const context of browser.contexts()) {
        await hooks.after?.(context, {});
    }
    const original = browser.newContext.bind(browser);
    browser.newContext = async (options) => {
        const next = { ...(options ?? {}) };
        await hooks.before?.(next);
        const context = await original(next);
        await hooks.after?.(context, next);
        return context;
    };
    return target;
}
export function onEachPage(target, handler) {
    const seen = new WeakSet();
    const watchContext = (context) => {
        if (seen.has(context))
            return;
        seen.add(context);
        for (const page of context.pages())
            handler(page);
        context.on("page", (page) => handler(page));
    };
    if (typeof target.newContext !== "function") {
        watchContext(target);
        return target;
    }
    const browser = target;
    for (const context of browser.contexts())
        watchContext(context);
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
        const context = await originalNewContext(...args);
        watchContext(context);
        return context;
    };
    return target;
}
