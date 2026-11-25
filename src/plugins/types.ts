import type { Browser, BrowserContext, Page } from "playwright-core";
import {
	type ContextOptions,
	onEachContext,
	onEachPage,
} from "../pagehooks.js";

export interface BexxcvPlugin {
	name: string;
	order?: number;
	beforeLaunch?(options: Record<string, unknown>): void | Promise<void>;
	beforeContext?(options: ContextOptions): void | Promise<void>;
	onContext?(context: BrowserContext, options: ContextOptions): void | Promise<void>;
	onPage?(page: Page, context: BrowserContext): void;
	beforeClose?(contexts: BrowserContext[]): void | Promise<void>;
}

const DEFAULT_ORDER = 50;

function sortPlugins(plugins: BexxcvPlugin[]): BexxcvPlugin[] {
	return [...plugins].sort(
		(a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER),
	);
}

export async function runBeforeLaunch(
	plugins: BexxcvPlugin[],
	options: Record<string, unknown>,
): Promise<void> {
	for (const plugin of sortPlugins(plugins)) {
		await plugin.beforeLaunch?.(options);
	}
}

export async function applyPlugins<T extends Browser | BrowserContext>(
	target: T,
	plugins: BexxcvPlugin[],
): Promise<T> {
	const sorted = sortPlugins(plugins);

	await onEachContext(target, {
		before: async (options) => {
			for (const plugin of sorted) await plugin.beforeContext?.(options);
		},
		after: async (context, options) => {
			for (const plugin of sorted) await plugin.onContext?.(context, options);
		},
	});

	for (const plugin of sorted) {
		if (!plugin.onPage) continue;
		const handler = plugin.onPage.bind(plugin);
		onEachPage(target, (page) => handler(page, page.context()));
	}

	const closers = sorted.filter((plugin) => plugin.beforeClose);
	if (closers.length > 0) {
		const holder = target as unknown as {
			close: (...args: unknown[]) => Promise<void>;
		};
		const originalClose = holder.close.bind(target);
		holder.close = async (...args: unknown[]) => {
			const contexts =
				typeof (target as Browser).contexts === "function"
					? (target as Browser).contexts()
					: [target as BrowserContext];
			for (const plugin of [...closers].reverse()) {
				try {
					await plugin.beforeClose?.(contexts);
				} catch (error) {
					console.warn(
						`[bexxcv] plugin "${plugin.name}" failed on close: ${(error as Error).message}`,
					);
				}
			}
			return originalClose(...args);
		};
	}

	return target;
}
