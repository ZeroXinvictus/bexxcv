import fs from "node:fs";
import { join } from "node:path";
import { InvalidAddonPath } from "./exceptions.js";
import { getPath, unzip, webdl } from "./pkgman.js";
import { getAsBooleanFromENV } from "./utils.js";
export const DefaultAddons = {
    UBO: "https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/latest.xpi",
};
export function confirmPaths(paths) {
    for (const path of paths) {
        if (!fs.existsSync(path) || !fs.lstatSync(path).isDirectory()) {
            throw new InvalidAddonPath(path);
        }
        if (!fs.existsSync(join(path, "manifest.json"))) {
            throw new InvalidAddonPath("manifest.json is missing. Addon path must be a path to an extracted addon.");
        }
    }
}
export async function addDefaultAddons(addonsList, excludeList = []) {
    const addons = {};
    for (const [name, url] of Object.entries(DefaultAddons)) {
        if (!excludeList.includes(name)) {
            addons[name] = url;
        }
    }
    await maybeDownloadAddons(addons, addonsList);
}
export async function downloadAndExtract(url, extractPath, name) {
    const buffer = await webdl(url, `Downloading addon (${name})`, false);
    await unzip(buffer, extractPath, `Extracting addon (${name})`, false);
}
function getAddonPath(addonName) {
    return getPath(join("addons", addonName));
}
export async function maybeDownloadAddons(addons, addonsList = []) {
    if (getAsBooleanFromENV("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD", false)) {
        console.log("Skipping addon download due to PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD set!");
        return;
    }
    for (const addonName in addons) {
        const addonPath = getAddonPath(addonName);
        if (fs.existsSync(addonPath)) {
            addonsList.push(addonPath);
            continue;
        }
        try {
            fs.mkdirSync(addonPath, { recursive: true });
            await downloadAndExtract(addons[addonName], addonPath, addonName);
            addonsList.push(addonPath);
        }
        catch (e) {
            console.error(`Failed to download and extract ${addonName}: ${e}`);
            fs.rmSync(addonPath, { recursive: true, force: true });
        }
    }
}
