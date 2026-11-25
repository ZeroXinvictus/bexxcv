import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir =
	import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));

export const PIN_FILE = path.join(currentDir, "data-files", "browser-pin.json");

export interface BrowserPin {
	tag: string;
	repo: string;
	repoName: string;
	version: string;
	build: string;
}

export function pinSpec(pin: BrowserPin): string {
	return `${pin.version}-${pin.build}`;
}

export function loadPin(file: string = PIN_FILE): BrowserPin | null {
	let data: any;
	try {
		data = JSON.parse(fs.readFileSync(file, "utf-8"));
	} catch {
		return null;
	}
	if (!data?.tag) return null;
	return {
		tag: data.tag,
		repo: String(data.repo),
		repoName: String(data.repo_name).toLowerCase(),
		version: String(data.version),
		build: String(data.build),
	};
}

export function effectivePin(config: {
	channel?: string;
	pinned?: string;
}): BrowserPin | null {
	return config.channel || config.pinned ? null : loadPin();
}

export function pinMatches(
	pin: BrowserPin,
	repoName: string,
	version: string,
	build: string,
): boolean {
	return (
		repoName.toLowerCase() === pin.repoName &&
		version === pin.version &&
		build === pin.build
	);
}
