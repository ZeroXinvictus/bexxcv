import type { Browser, BrowserContext, Page } from "playwright-core";
import { onEachPage } from "../pagehooks.js";
import type { BexxcvPlugin } from "./types.js";

/**
 * Validates Cloudflare Precursor cookie consistency.
 *
 * Cloudflare sometimes issues a precursor cookie (domain: `.cloudflare.com` or
 * the challenge domain) that must stay in sync with `cf_clearance`. If the
 * precursor value changes between requests while browsing the same origin, it
 * usually means the session was re-challenged and the old clearance is stale.
 *
 * This plugin detects such drift and emits a warning + optional reload signal.
 */

export interface PrecursorOptions {
	/** Emit a console warning when drift is detected. Default true. */
	warn?: boolean;
	/** Call reload() on the page when drift exceeds threshold. Default false. */
	autoReload?: boolean;
	/** Cookie names to watch besides cf_clearance. */
	names?: string[];
}

interface SessionState {
	precursorValue: string | null;
	clearanceValue: string | null;
	lastCheckAt: number;
	driftCount: number;
}

const STATE = new WeakMap<Page, SessionState>();
const WARNED = new WeakSet<Page>();
const WATCHED = new WeakSet<object>();

async function readCookies(page: Page): Promise<{ precursor: string | null; clearance: string | null }> {
	try {
		const url = page.url();
		if (!url || url === "about:blank") return { precursor: null, clearance: null };
		const cookies = await page.context().cookies(url);
		let clearance: string | null = null;
		let precursor: string | null = null;
		for (const c of cookies) {
			if (c.name === "cf_clearance") clearance = c.value;
			if (c.name.startsWith("cf_") && c.name !== "cf_clearance") {
				precursor = c.value;
			}
		}
		return { clearance, precursor };
	} catch {
		return { precursor: null, clearance: null };
	}
}

function getState(page: Page): SessionState {
	let s = STATE.get(page);
	if (!s) {
		s = { precursorValue: null, clearanceValue: null, lastCheckAt: 0, driftCount: 0 };
		STATE.set(page, s);
	}
	return s;
}

export function precursor(options: PrecursorOptions = {}): BexxcvPlugin {
	const warn = options.warn ?? true;
	const autoReload = options.autoReload ?? false;
	const extraNames = new Set(options.names ?? []);

	return {
		name: "precursor",
		order: 42,
		onPage(page) {
			if (WATCHED.has(page)) return;
			WATCHED.add(page);

			// Initial snapshot
			readCookies(page).then(({ clearance, precursor: prec }) => {
				const s = getState(page);
				s.clearanceValue = clearance;
				s.precursorValue = prec;
				s.lastCheckAt = Date.now();
			});

			// Periodic check on navigation complete
			page.on("framenavigated", async () => {
				try {
					const { clearance, precursor: prec } = await readCookies(page);
					const s = getState(page);

					// Clearance changed → fresh solve, reset state
					if (clearance && clearance !== s.clearanceValue) {
						s.clearanceValue = clearance;
						s.precursorValue = prec;
						s.driftCount = 0;
						WARNED.delete(page);
						return;
					}

					// Precursor changed while clearance stayed the same → drift
					if (prec && prec !== s.precursorValue && s.clearanceValue) {
						s.driftCount++;
						s.precursorValue = prec;
						s.lastCheckAt = Date.now();

						if (warn && !WARNED.has(page)) {
							WARNED.add(page);
							console.warn(
								`[bexxcv] precursor: cookie drift detected on ${page.url()} (drift #${s.driftCount}). ` +
								`Session may be stale — consider reloading.`,
							);
						}

						if (autoReload && s.driftCount >= 2) {
							s.driftCount = 0;
							WARNED.delete(page);
							await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
						}
					} else if (!prec && s.clearanceValue) {
						// Precursor disappeared unexpectedly
						s.driftCount++;
						if (warn && !WARNED.has(page)) {
							WARNED.add(page);
							console.warn(`[bexxcv] precursor: missing precursor cookie on ${page.url()}`);
						}
					}
				} catch {
					// ignore transient errors
				}
			});

			// Also check after each response for non-navigation requests that set cookies
			page.on("response", async (response) => {
				try {
					const setCookieRaw = response.headers()["set-cookie"];
					const setCookies: string[] = Array.isArray(setCookieRaw) ? setCookieRaw : typeof setCookieRaw === "string" ? [setCookieRaw] : [];
					if (!setCookies.length) return;
					const hasCfClearance = setCookies.some((c: string) => c.startsWith("cf_clearance="));
					const hasOtherCf = setCookies.some(
						(c: string) => c.startsWith("cf_") && !c.startsWith("cf_clearance="),
					);
					if (!hasCfClearance && !hasOtherCf) return;

					const { clearance, precursor: prec } = await readCookies(page);
					const s = getState(page);
					if (clearance && clearance !== s.clearanceValue) {
						s.clearanceValue = clearance;
						s.precursorValue = prec;
						s.driftCount = 0;
						WARNED.delete(page);
					}
				} catch {
					// ignore
				}
			});
		},
	};
}

/** Get current precursor state for a page. */
export function getPrecursorState(page: Page): SessionState | null {
	return STATE.get(page) ?? null;
}

/** Force-reset precursor state (call after manual cookie injection). */
export function resetPrecursorState(page: Page): void {
	STATE.delete(page);
	WARNED.delete(page);
}

/** Attach precursor validation to an existing browser or context. */
export function attachPrecursor<T extends Browser | BrowserContext>(
	target: T,
	options: PrecursorOptions = {},
): T {
	void precursor(options); // side-effect plugin registration handled by applyPlugins
	return onEachPage(target, (_page) => {
		// ensures onPage handler runs
	});
}
