import { auditFingerprint, bexxcv } from "./dist/index.js";

const compare = process.argv.includes("--compare");
const modes = compare
	? [
			["tanpa preset", { os: "windows" }],
			["preset realistic", { os: "windows", preset: "realistic" }],
		]
	: [["preset realistic", { os: "windows", preset: "realistic" }]];

const t0 = Date.now();
const stamp = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);
const limit = (promise, ms, label) =>
	Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} lebih dari ${ms / 1000}s`)), ms).unref()),
	]);

for (const [label, options] of modes) {
	stamp(`${label}: meluncurkan browser`);
	const browser = await limit(bexxcv(options), 90000, "peluncuran");
	try {
		stamp("browser siap");
		const page = await browser.newPage();
		stamp("membuka halaman");
		await page.goto("https://example.com", { waitUntil: "domcontentloaded", timeout: 30000 });
		stamp("audit fingerprint");
		const report = await limit(auditFingerprint(page), 20000, "audit");
		stamp(`skor ${report.score}/100`);
		for (const check of report.checks) {
			console.log(`${check.ok ? "ok   " : "GAGAL"} ${check.id.padEnd(15)} ${check.detail}`);
		}
	} finally {
		await browser.close();
	}
}

stamp("selesai");
process.exit(0);
