import { initSession, advancePage, endSession, isSessionExpired, getSessionId } from "./session.js";
import type { Page } from "playwright-core";

export interface HumanBehaviorOptions {
	speed?: number;
	typoRate?: number;
	scrollPattern?: "natural" | "linear" | "burst";
	idleDrift?: boolean;
	sessionTimeout?: number;
	maxPagesPerSession?: number;
	pageTransitionMinMs?: number;
	pageTransitionMaxMs?: number;
	mouseAcceleration?: boolean;
}

const DEFAULT_MIN_MS = 800;
const DEFAULT_MAX_MS = 3_000;
const DEFAULT_TIMEOUT = 1_800_000;

function ensureOpts(opts: HumanBehaviorOptions): Required<Pick<HumanBehaviorOptions, "pageTransitionMinMs" | "pageTransitionMaxMs" | "sessionTimeout">> & Omit<HumanBehaviorOptions, "pageTransitionMinMs" | "pageTransitionMaxMs" | "sessionTimeout"> {
	return {
		pageTransitionMinMs: opts.pageTransitionMinMs ?? DEFAULT_MIN_MS,
		pageTransitionMaxMs: opts.pageTransitionMaxMs ?? DEFAULT_MAX_MS,
		sessionTimeout: opts.sessionTimeout ?? DEFAULT_TIMEOUT,
		...opts,
	};
}

function cryptoRandBetween(min: number, max: number): number {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return min + (buf[0]! / 0x100000000) * (max - min);
}

function cryptoGauss(seed: Uint8Array, index: number, mean: number, sd: number): number {
	let hash = 0x9e3779b9;
	for (let i = 0; i < seed.length; i++) {
		hash = ((hash << 5) - hash + seed[i]!) >>> 0;
	}
	hash = (hash + index * 0x5bd1e995) >>> 0;
	const u1 = Math.max((hash >>> 0) / 0x100000000, 1e-10);
	const nextHash = (hash ^ 0x9e3779b9) >>> 0;
	const u2 = nextHash / 0x100000000;
	const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
	return mean + sd * z;
}

function createSession(page: Page, opts: HumanBehaviorOptions): void {
	if (!getSessionId(page)) {
		initSession(page, { timeout: opts.sessionTimeout });
	}
}

function getPageDelay(page: Page, opts: HumanBehaviorOptions): number {
	const resolved = ensureOpts(opts);
	const state = (page as any)._bexxcv_session;
	if (!state) return cryptoRandBetween(resolved.pageTransitionMinMs, resolved.pageTransitionMaxMs);
	const elapsed = Date.now() - state.createdAt;
	const progress = Math.min(elapsed / resolved.sessionTimeout, 1);
	const baseDelay = cryptoRandBetween(resolved.pageTransitionMinMs, resolved.pageTransitionMaxMs);
	const fatigueFactor = 1 + progress * 0.5;
	return baseDelay * fatigueFactor;
}

export function attachHumanBehavior(page: Page, options: HumanBehaviorOptions = {}): void {
	const opts = ensureOpts(options);
	createSession(page, opts);
	(page as any)._bexxcv_human_options = opts;

	const originalGoto = page.goto.bind(page);
	page.goto = async (...args: Parameters<Page["goto"]>) => {
		const delay = getPageDelay(page, opts);
		await sleep(cryptoRandBetween(delay * 0.3, delay));
		const result = await originalGoto(...args);
		advancePage(page);
		return result;
	};

	const originalClick = page.click.bind(page);
	page.click = async (selector: string, ...args: any[]) => {
		await sleep(cryptoRandBetween(120, 400));
		return originalClick(selector, ...args);
	};

	const originalEvaluate = page.evaluate.bind(page);
	page.evaluate = async <T>(pageFunction: any, ...evalArgs: any[]): Promise<T> => {
		if (opts.idleDrift) {
			const view = await page.viewportSize();
			if (view) {
				const state = (page as any)._bexxcv_session;
				const seed = state?.seedBuffer ?? new Uint8Array(32);
				const timeIndex = Date.now() % 1000;
				const driftX = cryptoGauss(seed, timeIndex, view.width / 2, view.width * 0.15);
				const driftY = cryptoGauss(seed, timeIndex + 1, view.height / 2, view.height * 0.1);
				await page.mouse.move(
					Math.max(0, Math.min(view.width, driftX)),
					Math.max(0, Math.min(view.height, driftY)),
				);
			}
		}
		return originalEvaluate(pageFunction, ...evalArgs);
	};
}

export function detachHumanBehavior(page: Page): void {
	const sessionState = (page as any)._bexxcv_session;
	if (sessionState) {
		endSession(page);
	}
	delete (page as any)._bexxcv_human_options;
	const origGoto = (page as any)._orig_goto;
	const origClick = (page as any)._orig_click;
	const origEval = (page as any)._orig_evaluate;
	if (origGoto) page.goto = origGoto;
	if (origClick) page.click = origClick;
	if (origEval) page.evaluate = origEval;
}

export function getSessionInfo(page: Page): { id: string | null; pageCount: number; ageMs: number } | null {
	const state = (page as any)._bexxcv_session;
	if (!state) return null;
	return {
		id: getSessionId(page),
		pageCount: state.pageCount,
		ageMs: Date.now() - state.createdAt,
	};
}

export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}
