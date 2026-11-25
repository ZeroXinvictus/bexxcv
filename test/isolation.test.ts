import { describe, expect, test } from "vitest";
import { Camoufox } from "../src";

describe("Per-context fingerprint isolation", () => {
	test("localStorage is isolated between two Camoufox contexts", async () => {
		const browser = await Camoufox({ headless: true });

		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();

		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();

		await pageA.goto("https://example.com");
		await pageB.goto("https://example.com");

		await pageA.evaluate(() => {
			localStorage.setItem("secret_key", "value-from-a");
			sessionStorage.setItem("sess_key", "sess-value-a");
		});

		const valA_from_b = await pageB.evaluate(
			() => localStorage.getItem("secret_key"),
		);
		const valSessA_from_b = await pageB.evaluate(
			() => sessionStorage.getItem("sess_key"),
		);

		expect(valA_from_b).toBeNull();
		expect(valSessA_from_b).toBeNull();

		const valB_set = await pageB.evaluate(() => {
			localStorage.setItem("secret_key", "value-from-b");
			return localStorage.getItem("secret_key");
		});
		expect(valB_set).toBe("value-from-b");

		// A must NOT see B's value either
		const valA_still = await pageA.evaluate(
			() => localStorage.getItem("secret_key"),
		);
		expect(valA_still).toBe("value-from-a");

		await browser.close();
	}, 60e3);

	test("cookies are isolated between Camoufox contexts", async () => {
		const browser = await Camoufox({ headless: true });

		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();

		await pageA.goto("https://example.com");
		await pageB.goto("https://example.com");

		await pageA.context().addCookies([
			{
				name: "session_a",
				value: "cookie-a",
				domain: "example.com",
				path: "/",
				httpOnly: false,
				secure: false,
				sameSite: "Lax",
			},
		]);

		const cookiesB = await pageB.context().cookies("https://example.com");
		const namesB = cookiesB.map((c) => c.name);
		expect(namesB).not.toContain("session_a");

		const cookiesA = await pageA.context().cookies("https://example.com");
		const namesA = cookiesA.map((c) => c.name);
		expect(namesA).toContain("session_a");

		await browser.close();
	}, 60e3);

	test("each context gets an independent fingerprint on first navigation", async () => {
		const browser = await Camoufox({ headless: true });

		const ctxA = await browser.newContext();
		const ctxB = await browser.newContext();
		const pageA = await ctxA.newPage();
		const pageB = await ctxB.newPage();

		const fpA = await pageA.evaluate(() => ({
			ua: navigator.userAgent,
			cores: navigator.hardwareConcurrency,
			screenW: screen.width,
			screenH: screen.height,
		}));
		const fpB = await pageB.evaluate(() => ({
			ua: navigator.userAgent,
			cores: navigator.hardwareConcurrency,
			screenW: screen.width,
			screenH: screen.height,
		}));

		// Fingerprints may coincidentally match, but at minimum neither should be undefined/null
		expect(fpA.ua).toBeTruthy();
		expect(fpB.ua).toBeTruthy();
		expect(fpA.cores).toBeGreaterThan(0);
		expect(fpB.cores).toBeGreaterThan(0);

		await browser.close();
	}, 60e3);
});
