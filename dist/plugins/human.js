import { Human } from "../human.js";
import { between, sleep } from "../random.js";
const WRAPPED = new WeakSet();
export function human(options = {}) {
    const think = options.think === false ? null : (options.think ?? [150, 700]);
    const speed = options.speed ?? 1;
    return {
        name: "human",
        order: 60,
        onPage(page) {
            if (WRAPPED.has(page))
                return;
            WRAPPED.add(page);
            const actor = new Human(page, options);
            const pause = async () => {
                if (think)
                    await sleep(between(think[0], think[1]) / speed);
            };
            page.click = (async (selector, clickOptions) => {
                await pause();
                await actor.click(selector, { button: clickOptions?.button });
            });
            page.hover = (async (selector) => {
                await pause();
                await actor.hover(selector);
            });
            page.fill = (async (selector, value) => {
                await pause();
                await actor.clear(selector);
                await actor.type(null, value);
            });
            page.type = (async (selector, text) => {
                await pause();
                await actor.type(selector, text);
            });
        },
    };
}
