import { describe, expect, it } from "vitest";
import { createHuman, type HumanPage } from "../src/human.js";

function makePage() {
	const events: [string, ...unknown[]][] = [];
	const page: HumanPage = {
		mouse: {
			move: async (x, y) => void events.push(["move", x, y]),
			down: async () => void events.push(["down"]),
			up: async () => void events.push(["up"]),
			wheel: async (_dx, dy) => void events.push(["wheel", dy]),
		},
		keyboard: {
			type: async (text) => void events.push(["type", text]),
			press: async (key) => void events.push(["press", key]),
		},
		locator: () => ({
			scrollIntoViewIfNeeded: async () => {},
			boundingBox: async () => ({ x: 400, y: 900, width: 200, height: 40 }),
		}),
		viewportSize: () => ({ width: 1280, height: 720 }),
		evaluate: async () => 720,
	};
	return { page, events };
}

describe("Human", () => {
	it("types the exact text even with typos enabled", async () => {
		const { page, events } = makePage();
		const human = createHuman(page, { speed: 20, typoRate: 0.2 });
		await human.type(null, "Hello World");
		const out: string[] = [];
		for (const [name, value] of events) {
			if (name === "type") out.push(value as string);
			if (name === "press" && value === "Backspace") out.pop();
		}
		expect(out.join("")).toBe("Hello World");
	});

	it("clicks inside the element box", async () => {
		const { page, events } = makePage();
		const human = createHuman(page, { speed: 20 });
		await human.click("#target");
		const moves = events.filter((e) => e[0] === "move");
		const [, x, y] = moves[moves.length - 1] as [string, number, number];
		expect(x).toBeGreaterThanOrEqual(400);
		expect(x).toBeLessThanOrEqual(600);
		expect(y).toBeGreaterThanOrEqual(900);
		expect(y).toBeLessThanOrEqual(940);
		expect(events.some((e) => e[0] === "down")).toBe(true);
		expect(events.some((e) => e[0] === "up")).toBe(true);
	});

	it("scrolls the requested distance", async () => {
		const { page, events } = makePage();
		const human = createHuman(page, { speed: 20 });
		await human.scroll(500);
		const total = events
			.filter((e) => e[0] === "wheel")
			.reduce((sum, e) => sum + (e[1] as number), 0);
		expect(total).toBe(500);
	});
});
