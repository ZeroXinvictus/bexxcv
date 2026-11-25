import { brake } from "./brake.js";
import { challengePlugin } from "./classify.js";
import { cocoon } from "./cocoon.js";
import { dodge } from "./dodge.js";
import { ephemeral } from "./ephemeral.js";
import { gauntlet } from "./gauntlet.js";
import { human } from "./human.js";
import { jsd } from "./jsd.js";
import { lens } from "./lens.js";
import { precursor } from "./precursor.js";
import { stash } from "./stash.js";
import { veneer } from "./veneer.js";
import { wiretap } from "./wiretap.js";
import { botScore } from "./botscore.js";
import { stealth } from "./stealth.js";
export const PLUGIN_KEYS = [
    "gauntlet",
    "wiretap",
    "stash",
    "veneer",
    "brake",
    "dodge",
    "cocoon",
    "gauntlet",
    "lens",
    "human",
    "plugins",
    "classify",
    "jsd",
    "ephemeral",
    "precursor",
    "botScore",
    "stealth",
];
function opts(value) {
    return value === true ? {} : value;
}
export function buildPlugins(options) {
    const list = [];
    // Core protection plugins — order matters
    if (options.dodge)
        list.push(dodge(options.dodge));
    if (options.cocoon)
        list.push(cocoon({ dir: options.cocoon }));
    if (options.stash) {
        list.push(stash(typeof options.stash === "string" ? { file: options.stash } : options.stash));
    }
    if (options.veneer)
        list.push(veneer(opts(options.veneer)));
    if (options.classify !== false)
        list.push(challengePlugin());
    if (options.precursor !== false)
        list.push(precursor(typeof options.precursor === "object" ? options.precursor : {}));
    if (options.botScore)
        list.push(botScore(typeof options.botScore === "object" ? options.botScore : {}));
    if (options.jsd !== false)
        list.push(jsd(typeof options.jsd === "object" ? options.jsd : {}));
    if (options.stealth)
        list.push(stealth(typeof options.stealth === "object" ? options.stealth : {}));
    if (options.ephemeral !== false)
        list.push(ephemeral(typeof options.ephemeral === "object" ? options.ephemeral : {}));
    if (options.gauntlet)
        list.push(gauntlet(opts(options.gauntlet)));
    if (options.human)
        list.push(human(opts(options.human)));
    if (options.brake)
        list.push(brake(opts(options.brake)));
    if (options.lens)
        list.push(lens(opts(options.lens)));
    if (options.wiretap)
        list.push(wiretap(opts(options.wiretap)));
    if (options.plugins)
        list.push(...options.plugins);
    return list;
}
export function stripPluginOptions(options) {
    const copy = { ...options };
    for (const key of PLUGIN_KEYS)
        delete copy[key];
    return copy;
}
export { applyPlugins, runBeforeLaunch } from "./types.js";
export { auditFingerprint, lensReport } from "./lens.js";
export { gauntletResult, runGauntlet } from "./gauntlet.js";
export { wiretapEntries } from "./wiretap.js";
export { brake, cocoon, dodge, gauntlet, human, lens, stash, veneer, wiretap, challengePlugin, jsd, ephemeral, precursor, botScore, stealth, attachStealth, getEphemeralEntries, replayEphemeral, isJsdPassed, getPrecursorState, resetPrecursorState, getBotScores, avgBotScore, hadLowScore } from "./index-reexports.js";
