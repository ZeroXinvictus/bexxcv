import { brake, type BrakeOptions } from "./brake.js";
import { challengePlugin, type ChallengeInfo, type ChallengeType } from "./classify.js";
import { cocoon } from "./cocoon.js";
import { dodge, type DodgeOptions } from "./dodge.js";
import { ephemeral, type EphemeralOptions, getEphemeralEntries, replayEphemeral } from "./ephemeral.js";
import { gauntlet, type GauntletOptions, type GauntletResult } from "./gauntlet.js";
import { human, type HumanPluginOptions } from "./human.js";
import { jsd, type JsdOptions, isJsdPassed } from "./jsd.js";
import { lens, type LensOptions, type LensReport, type LensCheck } from "./lens.js";
import { precursor, type PrecursorOptions, getPrecursorState, resetPrecursorState } from "./precursor.js";
import { stash, type StashOptions } from "./stash.js";
import type { BexxcvPlugin } from "./types.js";
import { veneer, type VeneerOptions } from "./veneer.js";
import { wiretap, type WiretapOptions } from "./wiretap.js";
import { botScore, type BotScoreOptions, getBotScores, avgBotScore, hadLowScore } from "./botscore.js";
import { stealth, type StealthOptions, attachStealth } from "./stealth.js";

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
] as const;

function opts<T extends object>(value: boolean | T): T {
	return value === true ? ({} as T) : (value as T);
}

export function buildPlugins(options: PluginOptions): BexxcvPlugin[] {
	const list: BexxcvPlugin[] = [];

	// Core protection plugins — order matters
	if (options.dodge) list.push(dodge(options.dodge));
	if (options.cocoon) list.push(cocoon({ dir: options.cocoon }));
	if (options.stash) {
		list.push(
			stash(typeof options.stash === "string" ? { file: options.stash } : options.stash),
		);
	}
	if (options.veneer) list.push(veneer(opts(options.veneer)));
	if (options.classify !== false) list.push(challengePlugin());
	if (options.precursor !== false) list.push(precursor(typeof options.precursor === "object" ? options.precursor : {}));
	if (options.botScore) list.push(botScore(typeof options.botScore === "object" ? options.botScore : {}));
	if (options.jsd !== false) list.push(jsd(typeof options.jsd === "object" ? options.jsd : {}));
	if (options.stealth) list.push(stealth(typeof options.stealth === "object" ? options.stealth : {}));
	if (options.ephemeral !== false) list.push(ephemeral(typeof options.ephemeral === "object" ? options.ephemeral : {}));
	if (options.gauntlet) list.push(gauntlet(opts(options.gauntlet)));
	if (options.human) list.push(human(opts(options.human)));
	if (options.brake) list.push(brake(opts(options.brake)));
	if (options.lens) list.push(lens(opts(options.lens)));
	if (options.wiretap) list.push(wiretap(opts(options.wiretap)));
	if (options.plugins) list.push(...options.plugins);
	return list;
}

export function stripPluginOptions<T extends Record<string, unknown>>(options: T): T {
	const copy: Record<string, unknown> = { ...options };
	for (const key of PLUGIN_KEYS) delete copy[key];
	return copy as T;
}

export { applyPlugins, runBeforeLaunch, type BexxcvPlugin } from "./types.js";
export { auditFingerprint, lensReport } from "./lens.js";
export { gauntletResult, runGauntlet } from "./gauntlet.js";
export { wiretapEntries } from "./wiretap.js";
	export { brake, cocoon, dodge, gauntlet, human, lens, stash, veneer, wiretap, challengePlugin, jsd, ephemeral, precursor, botScore, stealth, attachStealth, getEphemeralEntries, replayEphemeral, isJsdPassed, getPrecursorState, resetPrecursorState, getBotScores, avgBotScore, hadLowScore } from "./index-reexports.js";
export type {
	HumanPluginOptions,
	BrakeOptions,
	DodgeOptions,
	GauntletOptions,
	GauntletResult,
	LensOptions,
	LensReport,
	LensCheck,
	StashOptions,
	VeneerOptions,
	WiretapOptions,
	ChallengeInfo,
	ChallengeType,
	JsdOptions,
	EphemeralOptions,
	PrecursorOptions,
	BotScoreOptions,
};
