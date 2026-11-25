import type { Browser, BrowserContext, Page } from "playwright-core";

export type ContextOptions = NonNullable<Parameters<Browser["newContext"]>[0]>;

export interface ContextHooks {
	before?: (options: ContextOptions) => void | Promise<void>;
	after?: (
		context: BrowserContext,
		options: ContextOptions,
	) => void | Promise<void>;
}

export async function onEachContext<T extends Browser | BrowserContext>(
	target: T,
	hooks: ContextHooks,
): Promise<T> {
	if (typeof (target as Browser).newContext !== "function") {
		await hooks.after?.(target as BrowserContext, {});
		return target;
	}

	const browser = target as Browser;
	for (const context of browser.contexts()) {
		await hooks.after?.(context, {});
	}

	const original = browser.newContext.bind(browser);
	browser.newContext = async (options?: ContextOptions) => {
		const next: ContextOptions = { ...(options ?? {}) };
		await hooks.before?.(next);
		const context = await original(next);
		await hooks.after?.(context, next);
		return context;
	};

	return target;
}

export function onEachPage<T extends Browser | BrowserContext>(
	target: T,
	handler: (page: Page) => void,
): T {
	const seen = new WeakSet<object>();

	const watchContext = (context: BrowserContext) => {
		if (seen.has(context)) return;
		seen.add(context);
		for (const page of context.pages()) handler(page);
		context.on("page", (page: Page) => handler(page));
	};

	if (typeof (target as Browser).newContext !== "function") {
		watchContext(target as BrowserContext);
		return target;
	}

	const browser = target as Browser;
	for (const context of browser.contexts()) watchContext(context);

	const originalNewContext = browser.newContext.bind(browser);
	browser.newContext = async (...args: Parameters<Browser["newContext"]>) => {
		const context = await originalNewContext(...args);
		watchContext(context);
		return context;
	};

	return target;
}
