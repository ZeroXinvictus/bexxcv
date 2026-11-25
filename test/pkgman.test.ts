import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("INSTALL_DIR", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	test("defaults to the user cache dir", async () => {
		vi.stubEnv("CAMOUFOX_INSTALL_DIR", "");
		vi.resetModules();
		const { INSTALL_DIR } = await import("../src/pkgman");
		expect(INSTALL_DIR.toString()).toContain("camoufox");
		expect(path.isAbsolute(INSTALL_DIR.toString())).toBe(true);
	});

	test.skipIf(process.platform !== "linux")(
		"honors an absolute XDG_CACHE_HOME on Linux",
		async () => {
			vi.stubEnv("CAMOUFOX_INSTALL_DIR", "");
			vi.stubEnv("XDG_CACHE_HOME", "/xdg-cache");
			vi.resetModules();
			const { INSTALL_DIR } = await import("../src/pkgman");
			expect(INSTALL_DIR).toBe(path.join("/xdg-cache", "camoufox"));
		},
	);

	test.skipIf(process.platform !== "linux")(
		"ignores a relative XDG_CACHE_HOME",
		async () => {
			vi.stubEnv("CAMOUFOX_INSTALL_DIR", "");
			vi.stubEnv("XDG_CACHE_HOME", "relative/cache");
			vi.resetModules();
			const { INSTALL_DIR } = await import("../src/pkgman");
			expect(INSTALL_DIR).toBe(path.join(os.homedir(), ".cache", "camoufox"));
		},
	);

	test("CAMOUFOX_INSTALL_DIR overrides the install location", async () => {
		const target = path.join("custom", "camoufox-install");
		vi.stubEnv("CAMOUFOX_INSTALL_DIR", target);
		vi.resetModules();
		const { INSTALL_DIR } = await import("../src/pkgman");
		expect(INSTALL_DIR).toBe(path.resolve(target));
	});
});

describe("GitHubDownloader.getAsset", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("skips prerelease and draft releases", async () => {
		const { GitHubDownloader } = await import("../src/pkgman");
		const downloader = new GitHubDownloader("example/repo");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => [
					{ prerelease: true, assets: [{ browser_download_url: "bad-pre" }] },
					{ draft: true, assets: [{ browser_download_url: "bad-draft" }] },
					{ assets: [{ browser_download_url: "good" }] },
				],
			})),
		);
		await expect(downloader.getAsset()).resolves.toBe("good");
	});
});

function failingFetch() {
	return vi.fn(async () => ({
		ok: true,
		headers: { get: () => "0" },
		body: (async function* () {
			yield new Uint8Array([1, 2, 3]);
			throw new Error("connection reset");
		})(),
	}));
}

function succeedingFetch() {
	const zip = new AdmZip();
	zip.addFile("camoufox", Buffer.from("binary"));
	const bytes = new Uint8Array(zip.toBuffer());
	return vi.fn(async () => ({
		ok: true,
		headers: { get: () => "0" },
		body: (async function* () {
			yield bytes;
		})(),
	}));
}

describe("CamoufoxFetcher.install", () => {
	let tmp: string;
	let installDir: string;
	const versionedDir = () =>
		path.join(installDir, "browsers", "official", "1.0-beta.1");

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cfx-pkgtest-"));
		installDir = path.join(tmp, "install");
		fs.mkdirSync(installDir);
		vi.stubEnv("CAMOUFOX_INSTALL_DIR", installDir);
		vi.stubEnv("TMPDIR", tmp);
		vi.stubEnv("TEMP", tmp);
		vi.stubEnv("TMP", tmp);
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.resetModules();
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	function stagingDirs(): string[] {
		const browsers = path.join(installDir, "browsers");
		return [
			...fs
				.readdirSync(tmp)
				.filter((n) =>
					/^(camoufox-[A-Za-z0-9]{6}|(install|target)\.staging-.+)$/.test(n),
				),
			...(fs.existsSync(browsers)
				? fs.readdirSync(browsers).filter((n) => n.startsWith(".staging-"))
				: []),
		];
	}

	async function installWith(fetchImpl: ReturnType<typeof vi.fn>) {
		const { CamoufoxFetcher, Version } = await import("../src/pkgman");
		const fetcher = new CamoufoxFetcher();
		vi.spyOn(fetcher, "init").mockImplementation(async () => {
			fetcher._url = "https://example.test/camoufox.zip";
			fetcher._version_obj = new Version("beta.1", "1.0");
		});
		vi.stubGlobal("fetch", fetchImpl);
		vi.stubGlobal("console", {
			...console,
			error: vi.fn(),
			log: vi.fn(),
			warn: vi.fn(),
		});
		return fetcher;
	}

	test("keeps the previous install when the download fails", async () => {
		const marker = path.join(installDir, "version.json");
		fs.writeFileSync(marker, "{}");
		const fetcher = await installWith(failingFetch());
		await expect(fetcher.install()).rejects.toThrow("connection reset");
		expect(stagingDirs()).toEqual([]);
		expect(fs.existsSync(marker)).toBe(true);
		expect(fs.existsSync(versionedDir())).toBe(false);
	});

	test.skipIf(process.platform === "win32")(
		"installs through a symlinked install dir and keeps the link",
		async () => {
			const target = path.join(tmp, "target");
			fs.mkdirSync(target);
			fs.writeFileSync(path.join(target, "old-file"), "");
			fs.rmSync(installDir, { recursive: true });
			fs.symlinkSync(target, installDir);
			const fetcher = await installWith(succeedingFetch());
			await expect(fetcher.install()).resolves.toBeUndefined();
			expect(stagingDirs()).toEqual([]);
			expect(fs.lstatSync(installDir).isSymbolicLink()).toBe(true);
			expect(
				fs.existsSync(
					path.join(target, "browsers", "official", "1.0-beta.1", "camoufox"),
				),
			).toBe(true);
			expect(fs.existsSync(path.join(target, "old-file"))).toBe(true);
		},
	);

	test("replaces a flat install of an older release", async () => {
		fs.writeFileSync(
			path.join(installDir, "version.json"),
			JSON.stringify({ version: "152.0.4", release: "beta.31" }),
		);
		fs.writeFileSync(path.join(installDir, "camoufox"), "");
		fs.writeFileSync(path.join(installDir, "GeoLite2-City.mmdb"), "");
		fs.mkdirSync(path.join(installDir, "geoip"));
		fs.writeFileSync(path.join(installDir, "notes.txt"), "");
		const leftover = path.join(tmp, "install.staging-abc123");
		fs.mkdirSync(leftover);
		fs.utimesSync(leftover, 0, 0);
		const fetcher = await installWith(succeedingFetch());
		await expect(fetcher.install()).resolves.toBeUndefined();
		expect(stagingDirs()).toEqual([]);
		expect(fs.readdirSync(installDir).sort()).toEqual([
			".0.5_FLAG",
			"GeoLite2-City.mmdb",
			"browsers",
			"config.json",
			"geoip",
			"notes.txt",
		]);
		expect(fs.readdirSync(versionedDir()).sort()).toEqual([
			"camoufox",
			"version.json",
		]);
		expect(
			JSON.parse(
				fs.readFileSync(path.join(versionedDir(), "version.json"), "utf8"),
			),
		).toEqual({
			version: "1.0",
			build: "beta.1",
			prerelease: false,
			sha256: null,
			created_at: null,
		});
		expect(
			JSON.parse(fs.readFileSync(path.join(installDir, "config.json"), "utf8")),
		).toEqual({ active_version: "browsers/official/1.0-beta.1" });
	});

	test("leaves alone what another process is installing", async () => {
		const staging = path.join(installDir, "browsers", ".staging-other");
		fs.mkdirSync(staging, { recursive: true });
		fs.mkdirSync(versionedDir(), { recursive: true });
		fs.writeFileSync(path.join(versionedDir(), "partial"), "");
		const fetcher = await installWith(succeedingFetch());
		await expect(fetcher.install()).rejects.toThrow(
			"Another process is installing",
		);
		expect(fs.existsSync(staging)).toBe(true);
		expect(fs.readdirSync(versionedDir())).toEqual(["partial"]);
	});

	test("replaces an abandoned partial install", async () => {
		fs.mkdirSync(versionedDir(), { recursive: true });
		fs.writeFileSync(path.join(versionedDir(), "partial"), "");
		fs.utimesSync(versionedDir(), 0, 0);
		const fetcher = await installWith(succeedingFetch());
		await expect(fetcher.install()).resolves.toBeUndefined();
		expect(fs.readdirSync(versionedDir()).sort()).toEqual([
			"camoufox",
			"version.json",
		]);
	});

	test("rejects a download whose sha256 doesn't match", async () => {
		const fetcher = await installWith(succeedingFetch());
		fetcher.sha256 = "0".repeat(64);
		await expect(fetcher.install()).rejects.toThrow("Checksum mismatch");
		expect(stagingDirs()).toEqual([]);
		expect(
			fs.existsSync(
				path.join(installDir, "browsers", "official", "1.0-beta.1-00000000"),
			),
		).toBe(false);
	});

	test("names the install after its verified sha256", async () => {
		const { body } = await succeedingFetch()();
		const chunks: Uint8Array[] = [];
		for await (const chunk of body) chunks.push(chunk);
		const sha256 = createHash("sha256")
			.update(Buffer.concat(chunks))
			.digest("hex");

		const fetcher = await installWith(succeedingFetch());
		fetcher.sha256 = sha256;
		await expect(fetcher.install()).resolves.toBeUndefined();
		expect(
			fs.existsSync(
				path.join(
					installDir,
					"browsers",
					"official",
					`1.0-beta.1-${sha256.slice(0, 8)}`,
					"version.json",
				),
			),
		).toBe(true);
	});
});

describe("install resolution", () => {
	let installDir: string;

	beforeEach(() => {
		installDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfx-resolvetest-"));
		vi.stubEnv("CAMOUFOX_INSTALL_DIR", installDir);
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		vi.resetModules();
		fs.rmSync(installDir, { recursive: true, force: true });
	});

	function writeInstall(relativePath: string, data: Record<string, unknown>) {
		const dir = path.join(installDir, relativePath);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify(data));
		return dir;
	}

	const flatInstall = (release: string) =>
		writeInstall(".", { version: "152.0.4", release });

	const writeConfig = (config: Record<string, unknown>) =>
		fs.writeFileSync(
			path.join(installDir, "config.json"),
			JSON.stringify(config),
		);

	async function spyOnInstall() {
		const pkgman = await import("../src/pkgman");
		const install = vi
			.spyOn(pkgman.CamoufoxFetcher.prototype, "install")
			.mockResolvedValue();
		return { ensureCamoufoxInstalled: pkgman.ensureCamoufoxInstalled, install };
	}

	test("prefers the pinned build over a flat install", async () => {
		flatInstall("beta.31");
		const pin = (await import("../src/browser-pin")).loadPin();
		if (!pin) throw new Error("browser-pin.json must pin a build");
		const dir = writeInstall(
			`browsers/official/${pin.version}-${pin.build}-5720d45b`,
			{ version: pin.version, build: pin.build },
		);
		const { camoufoxPath, installedVerStr } = await import("../src/pkgman");
		expect(camoufoxPath()).toBe(dir);
		expect(installedVerStr()).toBe(`${pin.version}-${pin.build}`);
	});

	test("falls back to a flat install while the pinned build is missing", async () => {
		flatInstall("beta.31");
		writeInstall("browsers/official/156.0.1-beta.34", {
			version: "156.0.1",
			build: "beta.34",
		});
		const { camoufoxPath, installedVerStr } = await import("../src/pkgman");
		expect(camoufoxPath()).toBe(installDir);
		expect(installedVerStr()).toBe("152.0.4-beta.31");
	});

	test("launches an explicitly chosen build", async () => {
		const dir = writeInstall("browsers/official/152.0.4-beta.31", {
			version: "152.0.4",
			build: "beta.31",
		});
		writeConfig({
			channel: "official/stable",
			pinned: "152.0.4-beta.31",
			active_version: "browsers/official/152.0.4-beta.31",
		});
		const { camoufoxPath } = await import("../src/pkgman");
		expect(camoufoxPath()).toBe(dir);
	});

	test("reports a missing install", async () => {
		const { camoufoxPath, installedVerStr } = await import("../src/pkgman");
		const { CamoufoxNotInstalled, FileNotFoundError } = await import(
			"../src/exceptions"
		);
		expect(() => camoufoxPath()).toThrow(CamoufoxNotInstalled);
		expect(() => installedVerStr()).toThrow(FileNotFoundError);
	});

	test("ensureCamoufoxInstalled keeps a supported flat install", async () => {
		flatInstall("beta.31");
		const { ensureCamoufoxInstalled, install } = await spyOnInstall();
		await ensureCamoufoxInstalled();
		expect(install).not.toHaveBeenCalled();
	});

	test("ensureCamoufoxInstalled replaces an unsupported install once", async () => {
		flatInstall("alpha.1");
		const { ensureCamoufoxInstalled, install } = await spyOnInstall();
		await Promise.all([ensureCamoufoxInstalled(), ensureCamoufoxInstalled()]);
		expect(install).toHaveBeenCalledTimes(1);
	});

	test("ensureCamoufoxInstalled never replaces an explicit choice", async () => {
		writeConfig({ channel: "official/stable" });
		const { ensureCamoufoxInstalled, install } = await spyOnInstall();
		await ensureCamoufoxInstalled();
		expect(install).not.toHaveBeenCalled();
	});
});

describe("CamoufoxFetcher release selection", () => {
	let installDir: string;

	beforeEach(() => {
		installDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfx-selecttest-"));
		vi.stubEnv("CAMOUFOX_INSTALL_DIR", installDir);
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.resetModules();
		fs.rmSync(installDir, { recursive: true, force: true });
	});

	async function fetcherFor(builds: string[]) {
		const { CamoufoxFetcher, OS_NAME } = await import("../src/pkgman");
		const suffix = `${OS_NAME}.${CamoufoxFetcher.getPlatformArch()}.zip`;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () =>
					builds.map((build, i) => ({
						assets: [
							{
								name: `camoufox-${build}-${suffix}`,
								browser_download_url: `https://example.com/${build}`,
								digest: `sha256:${String(i).repeat(64)}`,
							},
						],
					})),
			})),
		);
		const fetcher = new CamoufoxFetcher();
		await fetcher.init();
		return fetcher;
	}

	const builds = ["156.0.1-beta.34", "152.0.4-beta.31", "152.0.4-beta.30"];

	test("installs the pinned build", async () => {
		const pin = (await import("../src/browser-pin")).loadPin();
		const fetcher = await fetcherFor(builds);
		expect(fetcher.verstr).toBe(`${pin?.version}-${pin?.build}`);
		expect(fetcher.sha256).toBe(
			String(builds.indexOf(fetcher.verstr)).repeat(64),
		);
	});

	test("requests the pinned release directly", async () => {
		const pin = (await import("../src/browser-pin")).loadPin();
		await fetcherFor(builds);
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
			`https://api.github.com/repos/daijro/camoufox/releases/tags/${pin?.tag}`,
		);
	});

	test("follows the newest supported build after an explicit choice", async () => {
		fs.writeFileSync(
			path.join(installDir, "config.json"),
			JSON.stringify({ channel: "official/stable" }),
		);
		const fetcher = await fetcherFor(builds);
		expect(fetcher.verstr).toBe("156.0.1-beta.34");
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
			"https://api.github.com/repos/daijro/camoufox/releases",
		);
	});
});

describe("camoufoxPath browser floor", () => {
	let installDir: string;

	beforeEach(() => {
		installDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfx-floortest-"));
		vi.stubEnv("CAMOUFOX_INSTALL_DIR", installDir);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.doUnmock("node:module");
		vi.resetModules();
		fs.rmSync(installDir, { recursive: true, force: true });
	});

	async function loadCamoufoxPath(playwright: string, release: string) {
		fs.writeFileSync(
			path.join(installDir, "version.json"),
			JSON.stringify({ version: "152.0.4", release }),
		);
		vi.doMock("node:module", async (importOriginal) => ({
			...(await importOriginal<typeof import("node:module")>()),
			createRequire: () => () => ({ version: playwright }),
		}));
		vi.resetModules();
		return (await import("../src/pkgman")).camoufoxPath;
	}

	test.each([
		["1.60.0", "beta.29"],
		["1.62.1", "beta.30"],
	])("accepts Playwright %s with %s", async (playwright, release) => {
		const camoufoxPath = await loadCamoufoxPath(playwright, release);
		expect(camoufoxPath(false)).toBe(installDir);
	});

	test("rejects builds below beta.30 from Playwright 1.61", async () => {
		const camoufoxPath = await loadCamoufoxPath("1.61.0", "beta.29");
		expect(() => camoufoxPath(false)).toThrow(">=beta.30");
	});

	test("rejects builds below the minimum version from Playwright 1.62", async () => {
		const camoufoxPath = await loadCamoufoxPath("1.62.1", "alpha.1");
		expect(() => camoufoxPath(false)).toThrow(">=beta.30");
	});
});

describe("CamoufoxFetcher supported range", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("skips releases newer than the supported range", async () => {
		const { CamoufoxFetcher, OS_NAME } = await import("../src/pkgman");
		const suffix = `${OS_NAME}.${CamoufoxFetcher.getPlatformArch()}.zip`;
		const asset = (name: string) => ({
			name,
			browser_download_url: `https://example.com/${name}`,
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => [
					{ assets: [asset(`camoufox-156.0.1-beta.34-${suffix}`)] },
					{ assets: [asset(`camoufox-152.0.4-beta.30-${suffix}`)] },
				],
			})),
		);
		const fetcher = new CamoufoxFetcher();
		await fetcher.init();
		expect(fetcher.verstr).toBe("152.0.4-beta.30");
	});
});
