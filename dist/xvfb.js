import { OS_NAME } from "./pkgman.js";
import { VirtualDisplay } from "./virtdisplay.js";
export function needsXvfb() {
    return (OS_NAME === "lin" &&
        !process.env.DISPLAY &&
        !process.env.WAYLAND_DISPLAY);
}
export async function startXvfb(debug = false) {
    const vd = new VirtualDisplay(debug);
    const display = await vd.get();
    return {
        display,
        kill: () => vd.kill(),
    };
}
export async function withXvfb(fn, debug = false) {
    const vd = new VirtualDisplay(debug);
    const display = await vd.get();
    try {
        return await fn(display);
    }
    finally {
        vd.kill();
    }
}
