import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src", "data-files");
const dbFile = path.join(dataDir, "webgl_data.db");
const stampFile = path.join(dataDir, "data-version.json");
const pinFile = path.join(dataDir, "browser-pin.json");

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => {
	const i = args.indexOf(name);
	return i === -1 ? null : args[i + 1] ?? null;
};

async function openDb(file) {
	let sqlite = null;
	try {
		sqlite = await import("node:sqlite");
	} catch {
		sqlite = null;
	}
	if (sqlite) return new sqlite.DatabaseSync(file, { readOnly: true });
	const { default: Database } = await import("better-sqlite3");
	return new Database(file, { readonly: true, fileMustExist: true });
}

async function inspect(file) {
	if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
		throw new Error(`webgl_data.db not found or empty at ${file}`);
	}
	const db = await openDb(file);
	try {
		const columns = db.prepare("PRAGMA table_info(webgl_fingerprints)").all().map((c) => c.name);
		for (const needed of ["vendor", "renderer", "data", "win", "mac", "lin"]) {
			if (!columns.includes(needed)) {
				throw new Error(`webgl_fingerprints is missing column "${needed}"`);
			}
		}
		const rows = db.prepare("SELECT COUNT(*) AS n FROM webgl_fingerprints").get().n;
		const perOs = {};
		for (const name of ["win", "mac", "lin"]) {
			perOs[name] = db.prepare(`SELECT COUNT(*) AS n FROM webgl_fingerprints WHERE ${name} > 0`).get().n;
			if (perOs[name] === 0) throw new Error(`no rows with data for ${name}`);
		}
		return { rows, perOs };
	} finally {
		db.close();
	}
}

function sha256(file) {
	return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeStamp(info) {
	let current = {};
	try {
		current = JSON.parse(fs.readFileSync(stampFile, "utf8"));
	} catch {
		current = {};
	}
	current.webgl_data = {
		updated: new Date().toISOString(),
		rows: info.rows,
		sha256: sha256(dbFile),
	};
	fs.writeFileSync(stampFile, JSON.stringify(current, null, "\t") + "\n");
}

function findDb(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const found = findDb(full);
			if (found) return found;
		} else if (entry.name === "webgl_data.db") {
			return full;
		}
	}
	return null;
}

async function install(source) {
	const info = await inspect(source);
	let previous = null;
	if (fs.existsSync(dbFile) && fs.statSync(dbFile).size > 0) {
		try {
			previous = await inspect(dbFile);
		} catch {
			previous = null;
		}
	}
	if (previous && info.rows < previous.rows * 0.5 && !has("--force")) {
		throw new Error(`new database has ${info.rows} rows, current has ${previous.rows}. Use --force to replace it`);
	}
	fs.copyFileSync(source, dbFile);
	writeStamp(info);
	console.log(`webgl_data.db updated: ${info.rows} rows (win=${info.perOs.win} mac=${info.perOs.mac} lin=${info.perOs.lin})`);
	if (previous) console.log(`previous: ${previous.rows} rows`);
}

export function parseTag(tag) {
	const m = /^v?(\d+\.\d+\.\d+)-(.+)$/.exec(tag);
	return m ? { tag, version: m[1], build: m[2] } : null;
}

async function pin() {
	const current = JSON.parse(fs.readFileSync(pinFile, "utf8"));
	const response = await fetch(`https://api.github.com/repos/${current.repo}/releases?per_page=10`, {
		headers: { "User-Agent": "bexxcv-update-data", Accept: "application/vnd.github+json" },
	});
	if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
	const releases = (await response.json()).filter((r) => !r.draft);
	const latest = releases.map((r) => parseTag(r.tag_name)).find(Boolean);
	if (!latest) throw new Error("no release with a recognizable tag");
	console.log(`pinned: ${current.tag}`);
	console.log(`latest: ${latest.tag}`);
	if (latest.tag === current.tag) {
		console.log("pin is up to date");
		return;
	}
	if (!has("--write")) {
		console.log("run again with --write to update browser-pin.json, then test before releasing");
		return;
	}
	const next = { ...current, tag: latest.tag, version: latest.version, build: latest.build };
	fs.writeFileSync(pinFile, JSON.stringify(next, null, "\t") + "\n");
	console.log("browser-pin.json updated");
}

async function main() {
	if (has("--stamp")) {
		const info = await inspect(dbFile);
		writeStamp(info);
		console.log(`stamped: ${info.rows} rows`);
		return;
	}
	if (value("--from")) {
		await install(path.resolve(value("--from")));
		return;
	}
	if (has("--npm")) {
		const pkg = value("--npm") ?? "camoufox-js";
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bexxcv-data-"));
		try {
			const tgz = execFileSync("npm", ["pack", pkg, "--silent"], { cwd: tmp, encoding: "utf8" }).trim().split("\n").pop();
			execFileSync("tar", ["-xzf", tgz], { cwd: tmp });
			const found = findDb(path.join(tmp, "package"));
			if (!found) throw new Error(`${pkg} does not contain webgl_data.db`);
			await install(found);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
		return;
	}
	if (has("--pin")) {
		await pin();
		return;
	}
	console.log("usage:");
	console.log("  node scripts/update-data.mjs --stamp");
	console.log("  node scripts/update-data.mjs --from /path/to/webgl_data.db [--force]");
	console.log("  node scripts/update-data.mjs --npm camoufox-js");
	console.log("  node scripts/update-data.mjs --pin [--write]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error.message);
		process.exit(1);
	});
}
