import * as fs from "node:fs";
import * as path from "node:path";
import type { BrowserContext, Response } from "playwright-core";
import type { BexxcvPlugin } from "./types.js";

export interface WiretapOptions {
	match?: string[];
	methods?: string[];
	out?: string;
	bodies?: boolean;
	maxBodyBytes?: number;
	streamTimeout?: number;
	redact?: boolean;
}

export interface WiretapEntry {
	time: string;
	method: string;
	url: string;
	status: number;
	requestHeaders: Record<string, string>;
	postData: string | null;
	responseHeaders: Record<string, string>;
	contentType: string;
	body: string | null;
	bodyNote?: string;
	events?: string[];
}

const SENSITIVE = new Set([
	"cookie",
	"set-cookie",
	"authorization",
	"proxy-authorization",
	"x-api-key",
]);

const STORES = new WeakMap<BrowserContext, WiretapEntry[]>();

export function wiretapEntries(context: BrowserContext): WiretapEntry[] {
	return STORES.get(context) ?? [];
}

function scrub(
	headers: Record<string, string>,
	redact: boolean,
): Record<string, string> {
	if (!redact) return { ...headers };
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		out[key] = SENSITIVE.has(key.toLowerCase()) ? "[redacted]" : value;
	}
	return out;
}

function matcher(patterns: string[] | undefined): (url: string) => boolean {
	if (!patterns || patterns.length === 0) return () => true;
	const tests = patterns.map((pattern) => {
		if (pattern.startsWith("re:")) {
			const re = new RegExp(pattern.slice(3));
			return (url: string) => re.test(url);
		}
		return (url: string) => url.includes(pattern);
	});
	return (url) => tests.some((test) => test(url));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timeout")), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

export function wiretap(
	input: string | string[] | WiretapOptions = {},
): BexxcvPlugin {
	const options: WiretapOptions =
		typeof input === "string"
			? { match: [input] }
			: Array.isArray(input)
				? { match: input }
				: input;
	const match = matcher(options.match);
	const methods = new Set((options.methods ?? []).map((m) => m.toUpperCase()));
	const redact = options.redact ?? true;
	const bodies = options.bodies ?? true;
	const maxBytes = options.maxBodyBytes ?? 1_000_000;
	const streamTimeout = options.streamTimeout ?? 60_000;
	const pending = new Set<Promise<void>>();

	const capture = async (response: Response, list: WiretapEntry[]) => {
		const request = response.request();
		if (methods.size > 0 && !methods.has(request.method())) return;
		const url = response.url();
		if (!match(url)) return;

		const responseHeaders = response.headers();
		const contentType = responseHeaders["content-type"] ?? "";
		const entry: WiretapEntry = {
			time: new Date().toISOString(),
			method: request.method(),
			url,
			status: response.status(),
			requestHeaders: scrub(request.headers(), redact),
			postData: request.postData(),
			responseHeaders: scrub(responseHeaders, redact),
			contentType,
			body: null,
		};

		if (bodies) {
			const stream = /event-stream/i.test(contentType);
			try {
				const text = await withTimeout(response.text(), stream ? streamTimeout : 10_000);
				if (Buffer.byteLength(text) > maxBytes) {
					entry.body = text.slice(0, maxBytes);
					entry.bodyNote = "truncated";
				} else {
					entry.body = text;
				}
				if (stream) {
					entry.events = text
						.split(/\r?\n\r?\n/)
						.map((chunk) => chunk.trim())
						.filter(Boolean);
				}
			} catch (error) {
				entry.bodyNote = (error as Error).message;
			}
		}

		list.push(entry);
	};

	const save = async (contexts: BrowserContext[]) => {
		if (!options.out) return;
		await Promise.allSettled([...pending]);
		const entries = contexts.flatMap((context) => wiretapEntries(context));
		entries.sort((a, b) => a.time.localeCompare(b.time));
		fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
		fs.writeFileSync(
			options.out,
			`${JSON.stringify({ captured: entries.length, entries }, null, 2)}\n`,
			{ mode: 0o600 },
		);
	};

	return {
		name: "wiretap",
		order: 30,
		onContext(context) {
			const list: WiretapEntry[] = [];
			STORES.set(context, list);
			context.on("response", (response) => {
				const task = capture(response, list)
					.catch(() => undefined)
					.finally(() => pending.delete(task));
				pending.add(task);
			});
		},
		beforeClose: save,
	};
}
