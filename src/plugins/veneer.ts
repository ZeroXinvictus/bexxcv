import type { BexxcvPlugin } from "./types.js";

export interface VeneerOptions {
	strict?: boolean;
}

export function veneer(options: VeneerOptions = {}): BexxcvPlugin {
	let warned = false;

	return {
		name: "veneer",
		order: 30,
		async onContext(context) {
			if (options.strict) {
				await context.route("**/*", async (route) => {
					const headers = route.request().headers();
					if (/firefox/i.test(headers["user-agent"] ?? "")) {
						const cleaned: Record<string, string> = {};
						for (const [key, value] of Object.entries(headers)) {
							if (!key.toLowerCase().startsWith("sec-ch-ua")) cleaned[key] = value;
						}
						if (Object.keys(cleaned).length !== Object.keys(headers).length) {
							await route.continue({ headers: cleaned });
							return;
						}
					}
					await route.continue();
				});
				return;
			}

			context.on("request", (request) => {
				if (warned) return;
				const headers = request.headers();
				if (
					/firefox/i.test(headers["user-agent"] ?? "") &&
					Object.keys(headers).some((key) => key.toLowerCase().startsWith("sec-ch-ua"))
				) {
					warned = true;
					console.warn(
						"[bexxcv] veneer: a Firefox user agent is sending sec-ch-ua headers, something upstream is injecting them. Use veneer: { strict: true } to strip them.",
					);
				}
			});
		},
	};
}
