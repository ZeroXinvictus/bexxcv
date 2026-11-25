import { watchTurnstile } from "../turnstile.js";
import { watchUam } from "../uam.js";
export function turnstile(options = {}) {
    return {
        name: "turnstile",
        order: 45,
        onPage: (page) => watchTurnstile(page, options),
    };
}
export function uam(options = {}) {
    return {
        name: "uam",
        order: 45,
        onPage: (page) => watchUam(page, options),
    };
}
