#!/usr/bin/env node
import { existsSync, rmSync } from "node:fs";
import { Command } from "commander";
import { DefaultAddons, maybeDownloadAddons } from "./addons.js";
import { doctor } from "./doctor.js";
import { ALLOW_GEOIP, downloadMMDB, removeMMDB } from "./locale.js";
import { CamoufoxFetcher, INSTALL_DIR, installedVerStr } from "./pkgman.js";
import { launchServer } from "./server.js";
import { applySelfUpdate, checkSelfUpdate } from "./selfupdate.js";
import { Bexxcv } from "./sync_api.js";
import { getAsBooleanFromENV } from "./utils.js";
class BexxcvUpdate extends CamoufoxFetcher {
    currentVerStr;
    constructor() {
        super();
        this.currentVerStr = null;
        try {
            this.currentVerStr = installedVerStr();
        }
        catch (error) {
            if (error instanceof Error && error.name === "FileNotFoundError") {
                this.currentVerStr = null;
            }
            else {
                throw error;
            }
        }
    }
    static async create() {
        const updater = new BexxcvUpdate();
        await updater.init();
        return updater;
    }
    isUpdateNeeded() {
        if (getAsBooleanFromENV("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", false)) {
            console.log("Skipping browser download / update check due to PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD set!");
            return false;
        }
        return this.currentVerStr === null || this.currentVerStr !== this.verstr;
    }
    async update() {
        if (!this.isUpdateNeeded()) {
            if (this.currentVerStr === null) {
                console.log(`No cached Camoufox binary found at ${INSTALL_DIR}. Provision it before launching, or unset PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD to download.`);
            }
            else if (getAsBooleanFromENV("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", false)) {
                console.log(`Using cached Camoufox v${this.currentVerStr} (update check skipped).`);
            }
            else {
                console.log("Camoufox binaries up to date!");
                console.log(`Current version: v${this.currentVerStr}`);
            }
            return;
        }
        if (this.currentVerStr !== null) {
            console.log(`Updating Camoufox binaries from v${this.currentVerStr} => v${this.verstr}`);
        }
        else {
            console.log("Fetching Camoufox binaries...");
        }
        await this.install();
    }
    async cleanup() {
        if (!existsSync(INSTALL_DIR)) {
            return false;
        }
        rmSync(INSTALL_DIR, { recursive: true, force: true });
        console.log("Camoufox binaries removed!");
        return true;
    }
}
const program = new Command();
program.command("fetch").action(async () => {
    const updater = await BexxcvUpdate.create();
    await updater.update();
    if (ALLOW_GEOIP) {
        await downloadMMDB();
    }
    await maybeDownloadAddons(DefaultAddons);
});
program.command("remove").action(async () => {
    const updater = await BexxcvUpdate.create();
    if (!(await updater.cleanup())) {
        console.log("Camoufox binaries not found!");
    }
    removeMMDB();
});
program
    .command("test")
    .argument("[url]", "URL to open", null)
    .action(async (url) => {
    const browser = await Bexxcv({
        headless: false,
        env: process.env,
        config: { showcursor: true },
        humanize: 0.5,
        geoip: true,
    });
    const page = await browser.newPage();
    if (url) {
        await page.goto(url);
    }
    await page.pause();
});
program.command("server").action(async () => {
    const server = await launchServer({});
    console.log(`Bexxcv server started at ${server.wsEndpoint()}`);
    console.log();
    console.log("Connect to it using Playwright's BrowserType.connect() method.");
    console.log("To stop the server, press Ctrl+C or close this terminal.");
});
program.command("path").action(() => {
    console.log(INSTALL_DIR);
});
program.command("version").action(async () => {
    const updater = await BexxcvUpdate.create();
    const binVer = updater.currentVerStr;
    if (!binVer) {
        console.log("Camoufox: Not downloaded! Run `bexxcv fetch` to install.");
        return;
    }
    console.log(`Camoufox: v${binVer}`);
    if (updater.isUpdateNeeded()) {
        console.log(`(Latest supported: v${updater.verstr})`);
    }
    else {
        console.log("(Up to date!)");
    }
});
program.command("doctor").action(async () => {
    const report = await doctor();
    for (const line of report.lines)
        console.log(line);
    process.exitCode = report.ok ? 0 : 1;
});
program.command("check-update").action(async () => {
    console.log("Checking for bexxcv updates...");
    try {
        const info = await checkSelfUpdate();
        if (info.hasUpdate) {
            console.log(`Update available: v${info.current} → v${info.latest}`);
            console.log(`Run \`bexxcv self-update\` to apply.`);
            console.log(info.releaseUrl);
        }
        else {
            console.log(`bexxcv is up to date (v${info.current}).`);
        }
    }
    catch (err) {
        console.error("Failed to check for updates:", err instanceof Error ? err.message : err);
        process.exit(1);
    }
});
program.command("self-update").action(async () => {
    try {
        await applySelfUpdate();
    }
    catch (err) {
        console.error("Self-update failed:", err instanceof Error ? err.message : err);
        process.exit(1);
    }
});
program.parse(process.argv);
