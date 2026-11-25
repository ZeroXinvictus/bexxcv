import type { Page } from "playwright-core";
import { Human, type HumanOptions, type HumanPage } from "../human.js";
import { between, sleep } from "../random.js";
import type { BexxcvPlugin } from "./types.js";

export interface HumanPluginOptions extends HumanOptions {
	think?: [number, number] | false;
}

const WRAPPED = new WeakSet<Page>();

export function human(options: HumanPluginOptions = {}): BexxcvPlugin {
	const think = options.think === false ? null : (options.think ?? [150, 700]);
	const speed = options.speed ?? 1;

	return {
		name: "human",
		order: 60,
		onPage(page) {
			if (WRAPPED.has(page)) return;
			WRAPPED.add(page);
			const actor = new Human(page as unknown as HumanPage, options);
			const pause = async () => {
				if (think) await sleep(between(think[0], think[1]) / speed);
			};

			page.click = (async (
				selector: string,
				clickOptions?: { button?: "left" | "right" | "middle" },
			) => {
				await pause();
				await actor.click(selector, { button: clickOptions?.button });
			}) as Page["click"];

			page.hover = (async (selector: string) => {
				await pause();
				await actor.hover(selector);
			}) as Page["hover"];

			page.fill = (async (selector: string, value: string) => {
				await pause();
				await actor.clear(selector);
				await actor.type(null, value);
			}) as Page["fill"];

			page.type = (async (selector: string, text: string) => {
				await pause();
				await actor.type(selector, text);
			}) as Page["type"];
		},
	};
}
