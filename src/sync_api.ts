import {
	type Browser,
	type BrowserContext,
	type BrowserType,
	firefox,
} from "playwright-core";

import {
	attachNoViewportDefault,
	type LaunchOptions,
	launchOptions,
	spoofsWindowDimensions,
	syncAttachVD,
} from "./utils.js";
import { warnIfDataStale } from "./doctor.js";
import { validateOptions } from "./schema.js";
import { attachTurnstile, type TurnstileOptions } from "./turnstile.js";
import {
	applyPlugins,
	type BexxcvPlugin,
	buildPlugins,
	type PluginOptions,
	runBeforeLaunch,
	stripPluginOptions,
} from "./plugins/index.js";
import { attachUam, type UamOptions } from "./uam.js";
import { VirtualDisplay } from "./virtdisplay.js";
import { needsXvfb } from "./xvfb.js";

export interface BexxcvOptions extends LaunchOptions {
	user_data_dir?: string;
	auto_xvfb?: boolean;
	turnstile?: boolean | TurnstileOptions;
	uam?: boolean | UamOptions;
	preset?: "realistic";
}

export type BexxcvLaunchOptions = BexxcvOptions & PluginOptions;

function applyPreset<T extends BexxcvOptions>(options: T): T {
	if (options.preset !== "realistic") return options;
	return {
		...options,
		humanize: options.humanize ?? true,
		geoip: options.geoip ?? true,
		enable_cache: options.enable_cache ?? true,
		realism: options.realism ?? true,
	};
}

export async function Bexxcv<
	UserDataDir extends string | undefined = undefined,
	ReturnType = UserDataDir extends string ? BrowserContext : Browser,
>(
	launch_options: BexxcvOptions &
		PluginOptions & { user_data_dir?: UserDataDir } = {},
	extraPlugins: BexxcvPlugin[] = [],
): Promise<ReturnType> {
	validateOptions(launch_options as Record<string, unknown>);
	warnIfDataStale();

	launch_options = applyPreset(launch_options);
	const pluginList = [
		...buildPlugins(launch_options as PluginOptions),
		...extraPlugins,
	];
	launch_options = { ...launch_options };
	await runBeforeLaunch(pluginList, launch_options as Record<string, unknown>);

	const {
		headless,
		user_data_dir,
		auto_xvfb = true,
		turnstile = false,
		uam = false,
		preset: _preset,
		...restOptions
	} = launch_options;
	const opts = stripPluginOptions(restOptions as Record<string, unknown>);

	
	
	
	const needsDisplay = auto_xvfb && needsXvfb();
	const effectiveHeadless: boolean | "virtual" = (() => {
		if (headless === "virtual") return "virtual";
		if (headless === true) return true;
		
		if (needsDisplay) return "virtual";
		return headless ?? false;
	})();

	const launched = await NewBrowser(
		firefox,
		effectiveHeadless,
		{},
		user_data_dir ?? (false as any),
		false,
		opts,
	);

	if (turnstile) {
		attachTurnstile(
			launched as unknown as Browser | BrowserContext,
			turnstile === true ? {} : turnstile,
		);
	}

	if (uam) {
		attachUam(
			launched as unknown as Browser | BrowserContext,
			uam === true ? {} : uam,
		);
	}

	if (pluginList.length > 0) {
		await applyPlugins(
			launched as unknown as Browser | BrowserContext,
			pluginList,
		);
	}

	return launched as unknown as ReturnType;
}

export const Camoufox = Bexxcv;

export async function NewBrowser<
	UserDataDir extends string | false = false,
	ReturnType = UserDataDir extends string ? BrowserContext : Browser,
>(
	playwright: BrowserType<Browser>,
	headless: boolean | "virtual" = false,
	fromOptions: Record<string, any> = {},
	userDataDir: UserDataDir = false as UserDataDir,
	debug: boolean = false,
	launch_options: LaunchOptions = {},
): Promise<ReturnType> {
	let virtualDisplay: VirtualDisplay | null = null;

	const normalizedHeadless: boolean =
		headless === "virtual" ? false : headless || false;

	if (headless === "virtual") {
		virtualDisplay = new VirtualDisplay(debug);
		launch_options.virtual_display = await virtualDisplay.get();
	}

	if (!fromOptions || Object.keys(fromOptions).length === 0) {
		fromOptions = await launchOptions({
			debug,
			...launch_options,
			headless: normalizedHeadless,
		});
	}

	const noViewportDefault = spoofsWindowDimensions(fromOptions);

	if (typeof userDataDir === "string") {
		if (noViewportDefault && !("viewport" in fromOptions)) {
			fromOptions = { ...fromOptions, viewport: null };
		}
		const context = await playwright.launchPersistentContext(
			userDataDir,
			fromOptions,
		);
		return syncAttachVD(context, virtualDisplay);
	}

	const browser = await playwright.launch(fromOptions);
	if (noViewportDefault) {
		attachNoViewportDefault(browser);
	}
	return syncAttachVD(browser, virtualDisplay);
}
