import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, test } from "vitest";
import { VirtualDisplay } from "../src/virtdisplay";

const N = Number.parseInt(process.env.VIRTDISPLAY_TEST_N ?? "50", 10);

const tracked = new Set<VirtualDisplay>();

function track(vd: VirtualDisplay): VirtualDisplay {
	tracked.add(vd);
	return vd;
}

function killAllTracked(): void {
	for (const vd of tracked) {
		try {
			vd.kill();
		} catch {
		}
	}
	tracked.clear();
}

function procOf(vd: VirtualDisplay) {
	return (
		vd as unknown as {
			proc: {
				exitCode: number | null;
				signalCode: string | null;
				pid?: number;
			};
		}
	).proc;
}

function hasExited(proc: {
	exitCode: number | null;
	signalCode: string | null;
}) {
	return proc.exitCode !== null || proc.signalCode !== null;
}

async function waitForExit(vd: VirtualDisplay, timeoutMs = 5_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (hasExited(procOf(vd))) return;
		await sleep(25);
	}
}

describe.skipIf(process.platform !== "linux")("VirtualDisplay", () => {
	afterEach(() => {
		killAllTracked();
	});

	test("single launch returns a valid display and kill terminates Xvfb", async () => {
		const vd = track(new VirtualDisplay());
		const display = await vd.get();
		expect(display).toMatch(/^:\d+$/);
		expect(procOf(vd).exitCode).toBeNull();

		vd.kill();
		await waitForExit(vd);
		tracked.delete(vd);
		expect(hasExited(procOf(vd))).toBe(true);
	}, 15_000);

	test("get() is idempotent within one VirtualDisplay", async () => {
		const vd = track(new VirtualDisplay());
		const a = await vd.get();
		const b = await vd.get();
		expect(a).toBe(b);
	}, 15_000);

	test(
		`${N} concurrent reservations all get unique displays`,
		async () => {
			const vds = Array.from({ length: N }, () => track(new VirtualDisplay()));

			const displays = await Promise.all(vds.map((vd) => vd.get()));

			for (const d of displays) {
				expect(d).toMatch(/^:\d+$/);
			}

			const unique = new Set(displays);
			expect(unique.size).toBe(displays.length);

			for (const vd of vds) {
				expect(procOf(vd).exitCode).toBeNull();
			}

			for (const vd of vds) vd.kill();
			await Promise.all(vds.map((vd) => waitForExit(vd)));
			tracked.clear();

			for (const vd of vds) {
				expect(hasExited(procOf(vd))).toBe(true);
			}
		},
		Math.max(5_000, N * 200),
	);

	test("kill() removes the X11 socket and lock file", async () => {
		const vd = track(new VirtualDisplay());
		const display = await vd.get();
		const n = display.slice(1);
		const socketPath = `/tmp/.X11-unix/X${n}`;
		const lockPath = `/tmp/.X${n}-lock`;
		expect(existsSync(socketPath)).toBe(true);

		vd.kill();
		await waitForExit(vd);
		tracked.delete(vd);

		expect(existsSync(socketPath)).toBe(false);
		expect(existsSync(lockPath)).toBe(false);
	}, 15_000);

	test("released display numbers can be reused on the next launch", async () => {
		const a = track(new VirtualDisplay());
		const aDisplay = await a.get();

		a.kill();
		await waitForExit(a);
		tracked.delete(a);

		const b = track(new VirtualDisplay());
		const bDisplay = await b.get();
		expect(bDisplay).toMatch(/^:\d+$/);

		b.kill();
		await waitForExit(b);
		tracked.delete(b);

		expect(aDisplay).toMatch(/^:\d+$/);
	}, 15_000);
});
