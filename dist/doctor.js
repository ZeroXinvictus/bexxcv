import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getPath } from "./pkgman.js";
import { REALISM_PROPERTIES, reconcileWebglKeys } from "./realism.js";
const currentDir = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(currentDir, "data-files");
export const DEFAULT_MAX_AGE_DAYS = 180;
let warned = false;
function readProperties() {
    try {
        const list = JSON.parse(fs.readFileSync(getPath("properties.json"), "utf-8"));
        return Object.fromEntries(list.map((p) => [p.property, p.type]));
    }
    catch {
        return null;
    }
}
export function readStamp(dir = DATA_DIR) {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, "data-version.json"), "utf-8"));
        const stamp = raw?.webgl_data;
        if (!stamp || typeof stamp.updated !== "string")
            return null;
        return stamp;
    }
    catch {
        return null;
    }
}
export function dataStatus(options = {}) {
    const dir = options.dir ?? DATA_DIR;
    const maxAge = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
    const file = path.join(dir, "webgl_data.db");
    let bytes = 0;
    try {
        bytes = fs.statSync(file).size;
    }
    catch {
        bytes = 0;
    }
    const stamp = readStamp(dir);
    let ageDays = null;
    if (stamp) {
        const time = Date.parse(stamp.updated);
        if (!Number.isNaN(time)) {
            ageDays = Math.floor((Date.now() - time) / 86_400_000);
        }
    }
    return {
        exists: bytes > 0,
        bytes,
        stamp,
        ageDays,
        stale: ageDays !== null && ageDays > maxAge,
    };
}
export function warnIfDataStale(maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
    if (warned || process.env.BEXXCV_NO_DATA_CHECK)
        return;
    const status = dataStatus({ maxAgeDays });
    if (!status.stale)
        return;
    warned = true;
    console.warn(`[bexxcv] WebGL data is ${status.ageDays} days old. Run "npx bexxcv doctor" to check it.`);
}
export async function doctor(options = {}) {
    const dir = options.dir ?? DATA_DIR;
    const status = dataStatus(options);
    const lines = [];
    let ok = true;
    if (!status.exists) {
        lines.push("webgl_data.db: missing or empty");
        return { ok: false, lines };
    }
    lines.push(`webgl_data.db: ${status.bytes} bytes`);
    try {
        const { default: Database } = await import("better-sqlite3");
        const db = new Database(path.join(dir, "webgl_data.db"), {
            readonly: true,
            fileMustExist: true,
        });
        try {
            const counts = ["win", "mac", "lin"].map((os) => {
                const row = db
                    .prepare(`SELECT COUNT(*) AS n FROM webgl_fingerprints WHERE ${os} > 0`)
                    .get();
                return `${os}=${row.n}`;
            });
            lines.push(`webgl_fingerprints rows with data: ${counts.join(" ")}`);
            if (counts.some((c) => c.endsWith("=0")))
                ok = false;
            const sample = db
                .prepare("SELECT data FROM webgl_fingerprints LIMIT 1")
                .get();
            if (sample) {
                const keys = Object.keys(JSON.parse(sample.data));
                lines.push(`data keys: ${keys.join(", ")}`);
                if (keys.length <= 3) {
                    ok = false;
                    lines.push("the database only holds vendor and renderer, other WebGL values would come from the host GPU");
                }
                const props = readProperties();
                if (props) {
                    const supported = REALISM_PROPERTIES.filter((key) => key in props);
                    lines.push(`realism properties supported by this browser: ${supported.length > 0 ? supported.join(", ") : "none"}`);
                    try {
                        const { webGl2Enabled: _skip, ...rest } = JSON.parse(sample.data);
                        reconcileWebglKeys(rest, props);
                        lines.push("data keys match the installed Camoufox build");
                    }
                    catch (error) {
                        ok = false;
                        lines.push(error.message);
                    }
                }
                else {
                    lines.push("properties.json not found, browser not installed yet");
                }
            }
        }
        finally {
            db.close();
        }
    }
    catch (error) {
        ok = false;
        lines.push(`webgl_fingerprints: cannot read (${error.message})`);
    }
    if (!status.stamp) {
        lines.push("data-version.json: missing, run scripts/update-data.mjs --stamp");
    }
    else {
        const actual = createHash("sha256")
            .update(fs.readFileSync(path.join(dir, "webgl_data.db")))
            .digest("hex");
        if (status.stamp.sha256 && status.stamp.sha256 !== actual) {
            ok = false;
            lines.push("data-version.json: sha256 does not match webgl_data.db");
        }
        lines.push(`last stamped: ${status.stamp.updated} (${status.ageDays} days ago)`);
        if (status.stale) {
            ok = false;
            lines.push("status: stale, refresh with scripts/update-data.mjs");
        }
    }
    if (ok)
        lines.push("status: ok");
    return { ok, lines };
}
