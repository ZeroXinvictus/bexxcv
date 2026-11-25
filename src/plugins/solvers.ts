import { type TurnstileOptions, watchTurnstile } from "../turnstile.js";
import { type UamOptions, watchUam } from "../uam.js";
import type { BexxcvPlugin } from "./types.js";

export function turnstile(options: TurnstileOptions = {}): BexxcvPlugin {
	return {
		name: "turnstile",
		order: 45,
		onPage: (page) => watchTurnstile(page, options),
	};
}

export function uam(options: UamOptions = {}): BexxcvPlugin {
	return {
		name: "uam",
		order: 45,
		onPage: (page) => watchUam(page, options),
	};
}
