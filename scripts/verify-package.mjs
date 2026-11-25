import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = ["webgl_data.db", "browser-pin.json", "territoryInfo.xml", "data-version.json"];
const missing = [];
const minBytes = Number(process.env.BEXXCV_MIN_DB_BYTES || 100000);
let dbSize = 0;
try {
	dbSize = fs.statSync(path.join(root, "dist", "data-files", "webgl_data.db")).size;
} catch {
	dbSize = 0;
}

for (const name of required) {
	const file = path.join(root, "dist", "data-files", name);
	if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
		missing.push(name);
	}
}

if (dbSize > 0 && dbSize < minBytes) {
	console.error(`webgl_data.db terlalu kecil (${dbSize} bytes), kemungkinan database buatan`);
	process.exit(1);
}

if (missing.length > 0) {
	console.error(`dist/data-files is missing or has empty files: ${missing.join(", ")}`);
	process.exit(1);
}

console.log("dist/data-files OK");

const [major, minor] = process.versions.node.split(".").map(Number);
if (major > 22 || (major === 22 && minor >= 12)) {
	const probe = spawnSync(
		process.execPath,
		[
			"-e",
			"const m = require('bexxcv'); if (typeof m.Bexxcv !== 'function' || typeof m.launchOptions !== 'function') process.exit(3);",
		],
		{ cwd: root, encoding: "utf8" },
	);
	if (probe.status !== 0) {
		console.error("require('bexxcv') gagal:", (probe.stderr || "").trim());
		process.exit(1);
	}
	console.log("require() OK");
} else {
	console.log("require() dilewati, butuh Node 22.12 atau lebih baru");
}
