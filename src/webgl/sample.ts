import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OS_ARCH_MATRIX } from "../pkgman.js";

declare const Bun: unknown;
declare const Deno: unknown;

interface SqliteDatabase {
	prepare(query: string): { all(...params: any[]): any[] };
	close(): void;
}

let DatabaseConstructor: (new (path: string) => SqliteDatabase) | null = null;

async function openDatabase(pathName: string): Promise<SqliteDatabase> {
	if (!fs.existsSync(pathName) || fs.statSync(pathName).size === 0) {
		throw new Error(
			`WebGL database not found or empty at ${pathName}. Place a valid webgl_data.db in src/data-files and rebuild.`,
		);
	}
	if (!DatabaseConstructor) {
		if (typeof Bun !== "undefined") {
			const { Database: BunDatabase } = await import("bun:sqlite" as any);
			DatabaseConstructor = BunDatabase;
		} else if (typeof Deno !== "undefined") {
			const { DatabaseSync } = await import("node:sqlite");
			DatabaseConstructor = DatabaseSync;
		} else {
			const { default: BetterSqlite3 } = await import("better-sqlite3");
			DatabaseConstructor = BetterSqlite3;
		}
	}
	return new DatabaseConstructor!(pathName);
}

const currentDir =
	import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(currentDir, "..", "data-files", "webgl_data.db");

interface WebGLData {
	vendor: string;
	renderer: string;
	data: string;
	win: number;
	mac: number;
	lin: number;
	webGl2Enabled: boolean;
}

interface VendorRenderer {
	vendor: string;
	renderer: string;
}

interface PossiblePairs {
	[key: string]: Array<VendorRenderer>;
}

export async function sampleWebGL(
	os: "win" | "mac" | "lin",
	vendor?: string,
	renderer?: string,
): Promise<WebGLData> {
	if (!OS_ARCH_MATRIX[os]) {
		throw new Error(`Invalid OS: ${os}. Must be one of: win, mac, lin`);
	}

	const db = await openDatabase(DB_PATH);
	let query = "";
	let params: any[] = [];

	if (vendor && renderer) {
		query = `SELECT vendor, renderer, data, ${os} FROM webgl_fingerprints WHERE vendor = ? AND renderer = ?`;
		params = [vendor, renderer];
	} else {
		query = `SELECT vendor, renderer, data, ${os} FROM webgl_fingerprints WHERE ${os} > 0`;
	}

	return new Promise<WebGLData>((resolve, reject) => {
		try {
			const rows: WebGLData[] = db.prepare(query).all(...params) as WebGLData[];

			if (rows.length === 0) {
				reject(new Error(`No WebGL data found for OS: ${os}`));
				return;
			}

			if (vendor && renderer) {
				const result = rows[0]!;
				if (result[os]! <= 0) {
					const pairs = db
						.prepare(
							`SELECT DISTINCT vendor, renderer FROM webgl_fingerprints WHERE ${os} > 0`,
						)
						.all();
					reject(
						new Error(
							`Vendor "${vendor}" and renderer "${renderer}" combination not valid for ${os}. Possible pairs: ${(pairs as Array<VendorRenderer>).map((pair) => `${pair.vendor}, ${pair.renderer}`).join(", ")}`,
						),
					);
					return;
				}
				resolve(JSON.parse(result.data));
			} else {
				const dataStrs = rows.map((row) => row.data);
				const probs = rows.map((row) => row[os]);
				const total = probs.reduce((a, b) => a + b, 0);
				const probsNorm = probs.map((p) => p / total);

				let cumulative = 0;
				const buf = new Uint32Array(1);
				crypto.getRandomValues(buf);
				const threshold = (buf[0]! / 0xffffffff) * 1;

				let idx = probsNorm.length - 1;
				for (let i = 0; i < probsNorm.length; i++) {
					cumulative += probsNorm[i];
					if (threshold <= cumulative) {
						idx = i;
						break;
					}
				}

				resolve(JSON.parse(dataStrs[idx]));
			}
		} catch (err) {
			reject(err);
		}
	}).finally(() => {
		db.close();
	});
}

export async function getPossiblePairs(): Promise<PossiblePairs> {
	const db = await openDatabase(DB_PATH);
	const result: PossiblePairs = {};

	return new Promise<PossiblePairs>((resolve, reject) => {
		try {
			const osTypes = Object.keys(OS_ARCH_MATRIX);

			osTypes.forEach((os_type) => {
				const rows = db
					.prepare(
						`SELECT DISTINCT vendor, renderer FROM webgl_fingerprints WHERE ${os_type} > 0 ORDER BY ${os_type} DESC`,
					)
					.all();

				result[os_type] = rows as Array<{ vendor: string; renderer: string }>;
			});

			resolve(result);
		} catch (err) {
			reject(err);
		}
	}).finally(() => {
		db.close();
	});
}
