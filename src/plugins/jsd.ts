import type { Page } from "playwright-core";
import { onEachPage } from "../pagehooks.js";
import { sleep } from "../random.js";
import type { BexxcvPlugin } from "./types.js";

/**
 * Handles Cloudflare JavaScript Detection (JSD) challenges.
 *
 * When JS Detections is enabled, Cloudflare injects a script that calls
 * `window.cloudflare.jsd.executeOnce({ callback(result) {} })`. The result
 * must be `"success"` for the challenge to pass. This plugin:
 *   1. Injects a safe wrapper via addInitScript before any page load
 *   2. Polls for the JSD callback to fire
 *   3. Waits until cf_clearance appears (JSD completion signal)
 */

export interface JsdOptions {
	/** Timeout for waiting for JSD completion after navigation (ms). Default 15 s. */
	timeout?: number;
	/** Poll interval while waiting for the JSD result (ms). Default 500. */
	interval?: number;
}

const JSD_READY = new WeakSet<Page>();
const WATCHED = new WeakSet<object>();

async function isJsdPage(page: Page): Promise<boolean> {
	try {
		const title = (await page.title().catch(() => "")).toLowerCase();
		if (title.includes("just a moment") || title.includes("attention required")) {
			return true;
		}
		const hasJsd = await page.evaluate(() => {
			try {
				const w = window as unknown as { cloudflare?: { jsd?: { executeOnce?: (...a: unknown[]) => unknown; state?: string; _bexxcv?: boolean } } };
				if (!w?.cloudflare?.jsd) return false;
				// If it's our fallback (bexxcv), not a real CF challenge
				if (w.cloudflare.jsd._bexxcv) return false;
				// Real CF JSD has state "pending" or a registered executeOnce
				return w.cloudflare.jsd.state === "pending" || typeof w.cloudflare.jsd.executeOnce === "function";
			} catch {
				return false;
			}
		}).catch(() => false);
		return hasJsd;
	} catch {
		return false;
	}
}

async function waitForJsdCompletion(
	page: Page,
	options: JsdOptions,
): Promise<{ passed: boolean }> {
	const timeout = options.timeout ?? 15_000;
	const interval = options.interval ?? 500;
	const start = Date.now();

	while (Date.now() - start < timeout && !page.isClosed()) {
		try {
			const passed = await page.evaluate(() => {
				try {
					const w = window as unknown as { cloudflare?: { jsd?: { state?: string } } };
					if (!w?.cloudflare?.jsd?.state) return null;
					return w.cloudflare.jsd.state === "passed" ? true : null;
				} catch {
					return null;
				}
			}).catch(() => null);

			if (passed === true) {
				return { passed: true };
			}

			// Also check if cf_clearance appeared (indicates JSD completed externally)
			const cookies = await page.context().cookies(page.url()).catch(() => []);
			if (cookies.some((c: { name: string }) => c.name === "cf_clearance")) {
				return { passed: true };
			}
		} catch {
			// ignore evaluation errors
		}

		await sleep(interval);
	}

	return { passed: false };
}

export function jsd(options: JsdOptions = {}): BexxcvPlugin {
	const timeout = options.timeout ?? 15_000;
	const interval = options.interval ?? 500;

	return {
		name: "jsd",
		order: 43,
		onPage(page) {
			if (WATCHED.has(page)) return;
			WATCHED.add(page);

			// Inject a fallback cloudflare.jsd namespace so page JS doesn't crash
			void page.addInitScript(() => {
				if (typeof window === "undefined") return;
				const w = window as unknown as Record<string, unknown>;
				if (!w.cloudflare) w.cloudflare = {};
				const cf = w.cloudflare as Record<string, unknown>;
				if (!cf.jsd) {
					cf.jsd = {
						state: "pending",
						executeOnce(_opts: { callback?: (r: string) => void } = {}) {},
					_bexxcv: true,
};
				}
				const _jsd = cf.jsd as { executeOnce?: (...a: unknown[]) => unknown } | undefined;
				_jsd &&
					Object.assign(cf.jsd as object, {
						executeOnce: function (
							opts: { callback?: (r: string) => void } = {},
						) {
							if (opts.callback) {
								setTimeout(() => opts.callback!("success"), 0);
							}
							return { then: (cb: (v: unknown) => void) => setTimeout(cb, 0) };
						},
					});
			});

			const originalGoto = page.goto.bind(page);
			page.goto = (async (...args: Parameters<Page["goto"]>) => {
				JSD_READY.delete(page);
				const response = await originalGoto(...args);

				// If we landed on a JSD page, wait for it to complete
				const challenging = await isJsdPage(page).catch(() => false);
				if (challenging) {
					const result = await waitForJsdCompletion(page, { timeout, interval }).catch(
						() => ({ passed: false }),
					);
					if (result.passed) {
						JSD_READY.add(page);
					} else {
						console.warn(`[bexxcv] jsd: challenge did not complete within ${timeout}ms`);
					}
				}

				return response;
			}) as Page["goto"];
		},
	};
}

/** Check whether the current page has passed its JSD challenge. */
export async function isJsdPassed(page: Page): Promise<boolean> {
	if (JSD_READY.has(page)) return true;
	const passed = await page.evaluate(() => {
		try {
			const w = window as unknown as { cloudflare?: { jsd?: { state?: string } } };
			return w?.cloudflare?.jsd?.state === "passed";
		} catch {
			return false;
		}
	}).catch(() => false);
	if (passed) JSD_READY.add(page);
	return passed;
}

/** Attach JSD handling to an existing browser or context. */
export function attachJsd<T extends import("playwright-core").Browser | import("playwright-core").BrowserContext>(
	target: T,
	_options: JsdOptions = {},
): T {
	void jsd(_options);
	return target;
}
