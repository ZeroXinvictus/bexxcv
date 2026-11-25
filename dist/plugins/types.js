import { onEachContext, onEachPage, } from "../pagehooks.js";
const DEFAULT_ORDER = 50;
function sortPlugins(plugins) {
    return [...plugins].sort((a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER));
}
export async function runBeforeLaunch(plugins, options) {
    for (const plugin of sortPlugins(plugins)) {
        await plugin.beforeLaunch?.(options);
    }
}
export async function applyPlugins(target, plugins) {
    const sorted = sortPlugins(plugins);
    await onEachContext(target, {
        before: async (options) => {
            for (const plugin of sorted)
                await plugin.beforeContext?.(options);
        },
        after: async (context, options) => {
            for (const plugin of sorted)
                await plugin.onContext?.(context, options);
        },
    });
    for (const plugin of sorted) {
        if (!plugin.onPage)
            continue;
        const handler = plugin.onPage.bind(plugin);
        onEachPage(target, (page) => handler(page, page.context()));
    }
    const closers = sorted.filter((plugin) => plugin.beforeClose);
    if (closers.length > 0) {
        const holder = target;
        const originalClose = holder.close.bind(target);
        holder.close = async (...args) => {
            const contexts = typeof target.contexts === "function"
                ? target.contexts()
                : [target];
            for (const plugin of [...closers].reverse()) {
                try {
                    await plugin.beforeClose?.(contexts);
                }
                catch (error) {
                    console.warn(`[bexxcv] plugin "${plugin.name}" failed on close: ${error.message}`);
                }
            }
            return originalClose(...args);
        };
    }
    return target;
}
