import type { Page } from "playwright-core";

export interface SessionOptions {
	timeout?: number;
	maxPages?: number;
	seedLength?: number;
}

interface SessionState {
	createdAt: number;
	pageCount: number;
	seedBuffer: Uint8Array;
}

const SESSIONS = new WeakMap<Page, SessionState>();
const ACTIVE_SESSIONS = new Map<string, SessionState>();

let sessionIdCounter = 0;

function generateSeed(length: number): Uint8Array {
	const buf = new Uint8Array(length);
	crypto.getRandomValues(buf);
	return buf;
}

function deriveByte(seed: Uint8Array, index: number): number {
	let hash = 0x9e3779b9;
	const data = new Uint8Array(seed.length + 4);
	data.set(seed);
	const view = new DataView(data.buffer);
	view.setUint32(seed.length, index, false);
	for (let i = 0; i < data.length; i++) {
		hash ^= data[i]!;
		hash = (hash * 0x5bd1e995 + 0x7b5a9a7f) >>> 0;
	}
	return hash >>> 0;
}

function seededRandom(seed: Uint8Array, index: number): number {
	const value = deriveByte(seed, index);
	return value / 0x100000000;
}

function gaussFromSeed(seed: Uint8Array, index: number, mean: number, sd: number): number {
	const u1 = Math.max(seededRandom(seed, index * 2), 1e-10);
	const u2 = seededRandom(seed, index * 2 + 1);
	const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
	return mean + sd * z;
}

export function getSessionId(page: Page): string | null {
	const state = SESSIONS.get(page);
	if (!state) return null;
	for (const [id, s] of ACTIVE_SESSIONS) {
		if (s === state) return id;
	}
	return null;
}

export function initSession(page: Page, options: SessionOptions = {}): string {
	const existingId = getSessionId(page);
	if (existingId) return existingId;

	const id = `sess_${++sessionIdCounter}_${Date.now().toString(36)}`;
	const state: SessionState = {
		createdAt: Date.now(),
		pageCount: 0,
		seedBuffer: generateSeed(options.seedLength ?? 32),
	};
	SESSIONS.set(page, state);
	ACTIVE_SESSIONS.set(id, state);
	return id;
}

export function getSession(state: SessionState): {
	seed: Uint8Array;
	now: number;
	elapsedMs: number;
	pageIndex: number;
} {
	return {
		seed: state.seedBuffer,
		now: Date.now(),
		elapsedMs: Date.now() - state.createdAt,
		pageIndex: state.pageCount,
	};
}

export function getSeededFloat(state: SessionState, index: number): number {
	return seededRandom(state.seedBuffer, index);
}

export function getSeededInt(state: SessionState, index: number, min: number, max: number): number {
	const range = max - min + 1;
	return min + (deriveByte(state.seedBuffer, index) % range);
}

export function getSeededGauss(state: SessionState, index: number, mean: number, sd: number): number {
	return gaussFromSeed(state.seedBuffer, index, mean, sd);
}

export function advancePage(page: Page): void {
	const state = SESSIONS.get(page);
	if (state) state.pageCount++;
}

export function endSession(page: Page): void {
	const state = SESSIONS.get(page);
	if (!state) return;
	for (const [id, s] of ACTIVE_SESSIONS) {
		if (s === state) {
			ACTIVE_SESSIONS.delete(id);
			break;
		}
	}
	SESSIONS.delete(page);
}

export function isSessionExpired(page: Page, timeoutMs?: number): boolean {
	const state = SESSIONS.get(page);
	if (!state) return true;
	const timeout = timeoutMs ?? 1_800_000;
	return Date.now() - state.createdAt > timeout;
}
