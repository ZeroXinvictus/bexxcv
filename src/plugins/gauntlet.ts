import type { Page } from "playwright-core";
import { sleep } from "../random.js";
import { createClicker, findWidgets, solveTurnstile } from "../turnstile.js";
import {
	humanActivity,
	isChallenge,
	
	type UamResult,
	waitForUam,
} from "../uam.js";
import type { BexxcvPlugin } from "./types.js";

export interface GauntletOptions {
	solve?: Array<"uam" | "turnstile">;
	maxTries?: number;
	timeout?: number;
	sustain?: number;
	watch?: boolean;
	interval?: number;
	maxRuntime?: number;
}

export interface GauntletResult {
	passed: boolean;
	tries: number;
	uam: UamResult | null;
	turnstile: string | null;
}

const RESULTS = new WeakMap<Page, GauntletResult>();
const WRAPPED = new WeakSet<Page>();
const RUNNING = new WeakSet<Page>();

export function gauntletResult(page: Page): GauntletResult | null {
	return RESULTS.get(page) ?? null;
}

async function widgetPending(page: Page): Promise<boolean> {
	try {
		const widgets = await findWidgets(page);
		return widgets.some((widget) => !widget.solved);
	} catch {
		return false;
	}
}

async function sustain(page: Page, ms: number): Promise<void> {
	const end = Date.now() + ms;
	while (Date.now() < end && !page.isClosed()) {
		try {
			await humanActivity(page);
		} catch {
			await sleep(500);
		}
	}
}

export async function runGauntlet(
	page: Page,
	options: GauntletOptions = {},
): Promise<GauntletResult> {
	const solve = options.solve ?? ["uam", "turnstile"];
	const maxTries = options.maxTries ?? 3;
	const timeout = options.timeout ?? 30000;
	const result: GauntletResult = { passed: false, tries: 0, uam: null, turnstile: null };
	const wantsTurnstile = solve.includes("turnstile");
	const startAttempt = Date.now();

	for (let attempt = 1; attempt <= maxTries && !page.isClosed(); attempt++) {
		result.tries = attempt;

		for (const stage of solve) {
			if (stage === "uam") {
				const clicker = wantsTurnstile ? createClicker() : undefined;
				result.uam = await waitForUam(page, { timeout, assist: clicker });
			} else if (stage === "turnstile") {
				const token = await solveTurnstile(page, timeout);
				if (token) result.turnstile = token;
			}
		}

		const stillChallenged = await isChallenge(page);
		const missingToken = wantsTurnstile && !result.turnstile && (await widgetPending(page));
		if (!stillChallenged && !missingToken) {
			result.passed = true;
			break;
		}
		await sleep(1500);
	}

	if (result.passed && options.sustain && options.sustain > 0) {
		await sustain(page, options.sustain);
	}
	return result;
}

async function runGuarded(
	page: Page,
	options: GauntletOptions,
	waitIfBusy: boolean,
): Promise<void> {
	if (RUNNING.has(page)) {
		if (!waitIfBusy) return;
		const limit = Date.now() + (options.timeout ?? 30000) * (options.maxTries ?? 3);
		while (RUNNING.has(page) && Date.now() < limit) await sleep(200);
		return;
	}
	RUNNING.add(page);
	try {
		RESULTS.set(page, await runGauntlet(page, options));
	} catch (error) {
		console.warn(`[bexxcv] gauntlet failed: ${(error as Error).message}`);
	} finally {
		RUNNING.delete(page);
	}
}

export function gauntlet(options: GauntletOptions = {}): BexxcvPlugin {
	return {
		name: "gauntlet",
		order: 50,
		onPage(page) {
			if (WRAPPED.has(page)) return;
			WRAPPED.add(page);

			const originalGoto = page.goto.bind(page);
			page.goto = (async (...args: Parameters<Page["goto"]>) => {
				const response = await originalGoto(...args);
				await runGuarded(page, options, true);
				return response;
			}) as Page["goto"];

			if (options.watch === false) return;
			let active = true;
			page.on("close", () => {
				active = false;
			});
			const interval = options.interval ?? 1500;
			const maxRuntimeMs = options.maxRuntime ?? 600_000;
			const runtimeStart = Date.now();
			void (async () => {
				while (active && !page.isClosed()) {
					if (Date.now() - runtimeStart >= maxRuntimeMs) {
						console.warn("[bexxcv] gauntlet: background watcher reached maxRuntime, stopping");
						break;
					}
					try {
						if (!RUNNING.has(page) && (await isChallenge(page))) {
							await runGuarded(page, options, false);
						}
					} catch {
						await sleep(500);
					}
					await sleep(interval);
				}
			})();
		},
	};
}
