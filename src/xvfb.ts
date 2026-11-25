import { OS_NAME } from "./pkgman.js";
import { VirtualDisplay } from "./virtdisplay.js";

export function needsXvfb(): boolean {
	return (
		OS_NAME === "lin" &&
		!process.env.DISPLAY &&
		!process.env.WAYLAND_DISPLAY
	);
}

export async function startXvfb(
	debug = false,
): Promise<{ display: string; kill: () => void }> {
	const vd = new VirtualDisplay(debug);
	const display = await vd.get();
	return {
		display,
		kill: () => vd.kill(),
	};
}

export async function withXvfb<T>(
	fn: (display: string) => Promise<T>,
	debug = false,
): Promise<T> {
	const vd = new VirtualDisplay(debug);
	const display = await vd.get();
	try {
		return await fn(display);
	} finally {
		vd.kill();
	}
}
