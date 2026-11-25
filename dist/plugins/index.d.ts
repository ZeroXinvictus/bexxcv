import { type BrakeOptions } from "./brake.js";
import { type ChallengeInfo, type ChallengeType } from "./classify.js";
import { type DodgeOptions } from "./dodge.js";
import { type EphemeralOptions } from "./ephemeral.js";
import { type GauntletOptions, type GauntletResult } from "./gauntlet.js";
import { type HumanPluginOptions } from "./human.js";
import { type JsdOptions } from "./jsd.js";
import { type LensOptions, type LensReport, type LensCheck } from "./lens.js";
import { type PrecursorOptions } from "./precursor.js";
import { type StashOptions } from "./stash.js";
import type { BexxcvPlugin } from "./types.js";
import { type VeneerOptions } from "./veneer.js";
import { type WiretapOptions } from "./wiretap.js";
import { type BotScoreOptions } from "./botscore.js";
import { type StealthOptions } from "./stealth.js";
export interface PluginOptions {
    gauntlet?: boolean | GauntletOptions;
    wiretap?: boolean | WiretapOptions;
    stash?: string | StashOptions;
    veneer?: boolean | VeneerOptions;
    brake?: boolean | BrakeOptions;
    dodge?: DodgeOptions;
    cocoon?: string;
    lens?: boolean | LensOptions;
    human?: boolean | HumanPluginOptions;
    plugins?: BexxcvPlugin[];
    /** Enable Cloudflare challenge classification (challenge-classify). Default true. */
    classify?: boolean;
    /** Enable JS Detection handling (jsd). Requires gauntlet: true. Default true. */
    jsd?: boolean | JsdOptions;
    /** Enable Turnstile ephemeral ID tracking (ephemeral). Default true. */
    ephemeral?: boolean | EphemeralOptions;
    /** Enable Precursor cookie drift detection (precursor). Default true. */
    precursor?: boolean | PrecursorOptions;
    /** Enable Bot Management score monitoring (bot-score-monitor). Default false. */
    botScore?: boolean | BotScoreOptions;
    /** Enable automation marker spoofing (stealth). Default false. */
    stealth?: boolean | StealthOptions;
}
export declare const PLUGIN_KEYS: readonly ["gauntlet", "wiretap", "stash", "veneer", "brake", "dodge", "cocoon", "gauntlet", "lens", "human", "plugins", "classify", "jsd", "ephemeral", "precursor", "botScore", "stealth"];
export declare function buildPlugins(options: PluginOptions): BexxcvPlugin[];
export declare function stripPluginOptions<T extends Record<string, unknown>>(options: T): T;
export { applyPlugins, runBeforeLaunch, type BexxcvPlugin } from "./types.js";
export { auditFingerprint, lensReport } from "./lens.js";
export { gauntletResult, runGauntlet } from "./gauntlet.js";
export { wiretapEntries } from "./wiretap.js";
export { brake, cocoon, dodge, gauntlet, human, lens, stash, veneer, wiretap, challengePlugin, jsd, ephemeral, precursor, botScore, stealth, attachStealth, getEphemeralEntries, replayEphemeral, isJsdPassed, getPrecursorState, resetPrecursorState, getBotScores, avgBotScore, hadLowScore } from "./index-reexports.js";
export type { HumanPluginOptions, BrakeOptions, DodgeOptions, GauntletOptions, GauntletResult, LensOptions, LensReport, LensCheck, StashOptions, VeneerOptions, WiretapOptions, ChallengeInfo, ChallengeType, JsdOptions, EphemeralOptions, PrecursorOptions, BotScoreOptions, };
