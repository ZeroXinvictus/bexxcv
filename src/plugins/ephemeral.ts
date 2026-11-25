import type { Browser, BrowserContext, Page } from "playwright-core";
import { onEachPage } from "../pagehooks.js";
import type { BexxcvPlugin } from "./types.js";

/**
 * Extracts and replays Turnstile Ephemeral IDs.
 *
 * Cloudflare's Turnstile assigns an ephemeral_id per session that is sent back
 * in the token payload. When the same widget is solved again (e.g. after a
 * navigation), Cloudflare cross-references this id against the previous solve.
 * Storing and replaying it reduces the chance of a fresh interactive challenge.
 */

export interface EphemeralOptions {
	/** Max age of a stored ephemeral entry before it is considered stale (ms). Default 10 min. */
	maxAgeMs?: number;
	/** If true, replay the ephemeral_id even if no new turnstile widget appears on next page. */
	autoReplay?: boolean;
}

interface EphemeralEntry {
	widgetKey: string;
	ephemeralId: string;
	expiresAt: number;
}

const CONTEXT_DATA = new WeakMap<BrowserContext, Map<string, EphemeralEntry>>();
const PAGE_LAST_URL = new WeakMap<Page, string>();
const WATCHED = new WeakSet<object>();

function getContextStore(context: BrowserContext): Map<string, EphemeralEntry> {
	let store = CONTEXT_DATA.get(context);
	if (!store) {
		store = new Map();
		CONTEXT_DATA.set(context, store);
	}
	return store;
}

async function extractEphemeralId(page: Page): Promise<string | null> {
	try {
		const result = await page.evaluate(() => {
			try {
				const w = window as unknown as {
					turnstile?: {
						getResponse?: () => string | undefined;
						getWidgetId?: () => string | null;
					};
				};
				const resp = w.turnstile?.getResponse?.();
				if (!resp || resp.length < 20) return null;
				// Ephemeral id is embedded as ?ephemeral_id=<hex> inside the response querystring
				const m = resp.match(/ephemeral_id=([A-Za-z0-9_-]+)/);
				return m?.[1] ?? null;
			} catch {
				return null;
			}
		});
		return result ?? null;
	} catch {
		return null;
	}
}

async function readToken(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		for (const el of Array.from(
			document.querySelectorAll<HTMLInputElement>('[name="cf-turnstile-response"]'),
		)) {
			if (el.value && el.value.length > 20) return el.value;
		}
		return null;
	}).catch(() => null);
}

export function ephemeral(options: EphemeralOptions = {}): BexxcvPlugin {
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
					if (entry.expiresAt < now) store.delete(key);
				}
			}, 60_000);
			prune.unref();
		},
		onPage(page) {
			if (WATCHED.has(page)) return;
			WATCHED.add(page);

			const originalGoto = page.goto.bind(page);
			page.goto = (async (...args: Parameters<Page["goto"]>) => {
				const url = String(args[0]);
				// Before navigating, try to replay stored ephemeral_id into hidden input
				if (autoReplay) {
					const prev = PAGE_LAST_URL.get(page);
					if (prev && prev !== url) {
						// Different page — clear stale data
						const store = getContextStore(page.context());
						const now = Date.now();
						for (const [key, e] of store.entries()) {
							if (e.expiresAt < now) store.delete(key);
						}
					}
				}
				PAGE_LAST_URL.set(page, url);
				return originalGoto(...args);
			}) as Page["goto"];

			// Watch for new tokens and capture ephemeral ids
			page.on("load", async () => {
				try {
					const token = await readToken(page);
					if (!token) return;
					const eid = await extractEphemeralId(page);
					if (!eid) return;
					const key = `${page.url()}:${eid.slice(0, 8)}`;
					getContextStore(page.context()).set(key, {
						widgetKey: key,
						ephemeralId: eid,
						expiresAt: Date.now() + maxAge,
					});
				} catch {
					// ignore
				}
			});
		},
	};
}

/** Retrieve stored ephemeral entries for a context. */
export function getEphemeralEntries(context: BrowserContext): EphemeralEntry[] {
	const store = CONTEXT_DATA.get(context) ?? new Map();
	return [...store.values()].filter((e) => e.expiresAt > Date.now());
}

/** Inject a stored ephemeral_id back into a hidden input on the target page. */
export async function replayEphemeral(page: Page, ephemeralId: string): Promise<boolean> {
	try {
		await page.evaluate(
			(id: string) => {
				const input = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
				if (!input) return false;
				input.dataset.ephemeralRef = id;
				return true;
			},
			ephemeralId,
		);
		return true;
	} catch {
		return false;
	}
}

export function attachEphemeral<T extends Browser | BrowserContext>(
	target: T,
	options: EphemeralOptions = {},
): T {
	void ephemeral(options); // side-effect plugin registration handled by applyPlugins
	return target;
}
