import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const PKG_NAME = "bexxcv";
function currentVersion() {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const raw = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return raw.version;
}
async function fetchLatestVersion() {
    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
        throw new Error(`npm registry responded with ${res.status} for ${PKG_NAME}`);
    }
    const data = (await res.json());
    return data.version;
}
function semverGt(a, b) {
    const parse = (v) => v
        .replace(/^v/, "")
        .split(".")
        .map((n) => Number.parseInt(n, 10) || 0);
    const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
    const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
    if (aMaj !== bMaj)
        return aMaj > bMaj;
    if (aMin !== bMin)
        return aMin > bMin;
    return aPatch > bPatch;
}
function detectPM() {
    for (const pm of ["pnpm", "yarn"]) {
        try {
            execFileSync(pm, ["--version"], { stdio: "ignore" });
            return pm;
        }
        catch { }
    }
    return "npm";
}
function installArgs(pm, pkg) {
    const target = `${pkg}@latest`;
    if (pm === "npm")
        return ["install", "-g", target];
    if (pm === "pnpm")
        return ["add", "-g", target];
    return ["global", "add", target];
}
export async function checkSelfUpdate() {
    const current = currentVersion();
    const latest = await fetchLatestVersion();
    return {
        current,
        latest,
        hasUpdate: semverGt(latest, current),
        releaseUrl: `https://www.npmjs.com/package/${PKG_NAME}/v/${latest}`,
    };
}
export async function applySelfUpdate() {
    const info = await checkSelfUpdate();
    if (!info.hasUpdate) {
        console.log(`bexxcv is already up to date (v${info.current}).`);
        return;
    }
    console.log(`Updating bexxcv v${info.current} → v${info.latest} ...`);
    const pm = detectPM();
    const args = installArgs(pm, PKG_NAME);
    console.log(`Running: ${pm} ${args.join(" ")}`);
    await new Promise((resolve, reject) => {
        const proc = execFile(pm, args, { stdio: "inherit" });
        proc.on("close", (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`${pm} exited with code ${code}`));
        });
        proc.on("error", reject);
    });
    console.log(`bexxcv updated to v${info.latest}.`);
}
