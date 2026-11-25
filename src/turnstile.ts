import type { Browser, BrowserContext, Page } from "playwright-core";
import { onEachPage } from "./pagehooks.js";
import { between, sleep } from "./random.js";

export interface TurnstileOptions {
	/** Polling interval for checking widget state (ms). */
	interval?: number;
	/** Minimum time between repeated clicks on the same widget (ms). */
	retryAfter?: number;
}

export interface Widget {
	x: number;
	y: number;
	w: number;
	h: number;
	solved: boolean;
	key: string;
}

const WATCHED = new WeakSet<object>();

// --- Widget discovery --------------------------------------------------------

export async function findWidgets(page: Page): Promise<Widget[]> {
	return page.evaluate(() => {
		const out: Widget[] = [];
		const seen = new Set<string>();

		const push = (el: Element, solved: boolean) => {
			let rect = el.getBoundingClientRect();
			if (rect.width < 10 || rect.height < 10) return;
			if (!solved && (rect.top < 0 || rect.bottom > window.innerHeight)) {
				el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
				rect = el.getBoundingClientRect();
			}
			const key = `${Math.round(rect.x + window.scrollX)}:${Math.round(rect.y + window.scrollY)}:${Math.round(rect.width)}`;
			if (seen.has(key)) return;
			seen.add(key);
			out.push({ x: rect.x, y: rect.y, w: rect.width, h: rect.height, solved, key });
		};

		// 1. Implicit rendering: hidden input with the token
		for (const input of Array.from(
			document.querySelectorAll<HTMLInputElement>('[name="cf-turnstile-response"]'),
		)) {
			const parent = input.parentElement;
			if (!parent) continue;
			push(parent, !!(input.value && input.value.length > 20));
		}

		// 2. Fallback: bare widget box heuristic (width ~300px, empty, compact)
		if (out.length === 0) {
			for (const strict of [true, false]) {
				for (const div of Array.from(document.querySelectorAll("div"))) {
					const rect = div.getBoundingClientRect();
					if (rect.width <= 290 || rect.width > 310 || div.querySelector("*")) continue;
					if (strict) {
						const css = window.getComputedStyle(div);
						if (css.margin !== "0px" || css.padding !== "0px") continue;
					}
					push(div, false);
				}
				if (out.length > 0) break;
			}
		}

		return out;
	});
}

// --- Token reading -----------------------------------------------------------

export async function readTurnstileToken(page: Page): Promise<string | null> {
	try {
		return await page.evaluate(() => {
			for (const el of Array.from(
				document.querySelectorAll<HTMLInputElement>('[name="cf-turnstile-response"]'),
			)) {
				if (el.value && el.value.length > 20) return el.value;
			}
			try {
				const w = window as unknown as {
					turnstile?: { getResponse?: () => string | undefined };
				};
				const value = w.turnstile?.getResponse?.();
				if (value && value.length > 20) return value;
			} catch {
				return null;
			}
			return null;
		});
	} catch {
		return null;
	}
}

// --- Click helpers -----------------------------------------------------------

async function clickAt(page: Page, x: number, y: number): Promise<void> {
	await page.mouse.move(x + between(-60, 60), y + between(-40, 40), { steps: 4 });
	await sleep(between(60, 160));
	await page.mouse.move(x, y, { steps: Math.floor(between(8, 16)) });
	await sleep(between(60, 140));
	await page.mouse.down();
	await sleep(between(60, 120));
	await page.mouse.up();
}

async function clickPending(
	page: Page,
	clicked: Map<string, number>,
	retryAfter: number,
): Promise<{ widgets: Widget[]; clicks: number }> {
	const widgets = await findWidgets(page);
	let clicks = 0;
	for (const widget of widgets) {
		if (widget.solved) continue;
		const last = clicked.get(widget.key) ?? 0;
		if (Date.now() - last < retryAfter) continue;
		clicked.set(widget.key, Date.now());
		const x = widget.x + Math.min(30, widget.w / 2) + between(-4, 4);
		const y = widget.y + widget.h / 2 + between(-4, 4);
		await clickAt(page, x, y);
		clicks++;
	}
	return { widgets, clicks };
}

export function createClicker(retryAfter = 8000): (page: Page) => Promise<boolean> {
	const clicked = new Map<string, number>();
	return async (page) => {
		const result = await clickPending(page, clicked, retryAfter);
		return result.clicks > 0;
	};
}

// --- Solve -------------------------------------------------------------------

export async function solveTurnstile(
	page: Page,
	timeout = 30000,
	idleChecks = 4,
	retryAfter = 8000,
): Promise<string | null> {
	const end = Date.now() + timeout;
	const clicked = new Map<string, number>();
	let idle = 0;

	while (Date.now() < end && !page.isClosed()) {
		const token = await readTurnstileToken(page);
		if (token) return token;
		try {
			const result = await clickPending(page, clicked, retryAfter);
			idle = result.widgets.length === 0 ? idle + 1 : 0;
		} catch {
			idle++;
		}
		if (idle >= idleChecks) return null;
		await sleep(1000);
	}
	return readTurnstileToken(page);
}

// --- Watcher -----------------------------------------------------------------

export function watchTurnstile(page: Page, options: TurnstileOptions = {}): void {
	if (WATCHED.has(page)) return;
	WATCHED.add(page);

	const interval = options.interval ?? 1000;
	const retryAfter = options.retryAfter ?? 8000;
	const clicked = new Map<string, number>();
	let active = true;

	page.on("close", () => {
		active = false;
	});

	const loop = async () => {
		while (active && !page.isClosed()) {
			try {
				await clickPending(page, clicked, retryAfter);
			} catch {
				await sleep(500);
			}
			await sleep(interval);
		}
	};

	void loop();
}

export function attachTurnstile<T extends Browser | BrowserContext>(
	target: T,
	options: TurnstileOptions = {},
): T {
	return onEachPage(target, (page) => watchTurnstile(page, options));
}
