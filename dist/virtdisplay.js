import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants as fsConstants, unlinkSync } from "node:fs";
import { CannotExecuteXvfb, CannotFindXvfb, VirtualDisplayNotSupported, } from "./exceptions.js";
import { OS_NAME } from "./pkgman.js";
const DISPLAYFD_READ_TIMEOUT_MS = Number(process.env.BEXXCV_XVFB_FD_TIMEOUT_MS) || 10_000;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = Number(process.env.BEXXCV_XVFB_GRACEFUL_TIMEOUT_MS) || 3_000;
export class VirtualDisplay {
    debug;
    proc = null;
    _display = null;
    constructor(debug = false) {
        this.debug = debug;
    }
    get xvfb_args() {
        return [
            "-screen",
            "0",
            "1x1x24",
            "-ac",
            "-nolisten",
            "tcp",
            "-extension",
            "RENDER",
            "+extension",
            "GLX",
            "-extension",
            "COMPOSITE",
            "-extension",
            "XVideo",
            "-extension",
            "XVideo-MotionCompensation",
            "-extension",
            "XINERAMA",
            "-fp",
            "built-ins",
            "-nocursor",
            "-br",
        ];
    }
    get xvfb_path() {
        let resolved;
        try {
            resolved = execFileSync("which", ["Xvfb"]).toString().trim();
        }
        catch {
            throw new CannotFindXvfb("Xvfb not found. Install it with: sudo apt-get install xvfb");
        }
        if (!resolved) {
            throw new CannotFindXvfb("Xvfb not found. Install it with: sudo apt-get install xvfb");
        }
        try {
            accessSync(resolved, fsConstants.X_OK);
        }
        catch {
            throw new CannotExecuteXvfb(`No execute permission on Xvfb: ${resolved}`);
        }
        return resolved;
    }
    spawnXvfb() {
        const xvfbPath = this.xvfb_path;
        const cmd = [xvfbPath, "-displayfd", "3", ...this.xvfb_args];
        if (this.debug) {
            console.log("Starting virtual display:", cmd.join(" "));
        }
        return spawn(cmd[0], cmd.slice(1), {
            stdio: [
                "ignore",
                this.debug ? "inherit" : "ignore",
                this.debug ? "inherit" : "ignore",
                "pipe",
            ],
            detached: true,
            env: {
                ...process.env,
                __GLX_VENDOR_LIBRARY_NAME: "mesa",
                LIBGL_ALWAYS_SOFTWARE: "1",
            },
        });
    }
    async get() {
        VirtualDisplay.assert_linux();
        if (!this.proc) {
            this.proc = this.spawnXvfb();
            const stream = this.proc.stdio[3];
            const timer = setTimeout(() => stream.destroy(new CannotExecuteXvfb(`Xvfb did not report a display within ${DISPLAYFD_READ_TIMEOUT_MS}ms`)), DISPLAYFD_READ_TIMEOUT_MS);
            let buf = "";
            try {
                for await (const chunk of stream) {
                    buf += chunk;
                    if (buf.includes("\n"))
                        break;
                }
            }
            catch (err) {
                this.kill();
                throw err;
            }
            finally {
                clearTimeout(timer);
            }
            const n = Number.parseInt(buf, 10);
            if (!Number.isFinite(n)) {
                this.kill();
                throw new CannotExecuteXvfb(`Xvfb did not report a display (got ${JSON.stringify(buf)}, exit=${this.proc.exitCode})`);
            }
            this._display = n;
        }
        else if (this.debug) {
            console.log(`Using virtual display: ${this._display}`);
        }
        return `:${this._display}`;
    }
    kill() {
        const proc = this.proc;
        const display = this._display;
        if (!proc || proc.exitCode !== null || proc.killed)
            return;
        if (this.debug) {
            console.log("Terminating virtual display:", display);
        }
        const cleanupLock = () => {
            try {
                unlinkSync(`/tmp/.X${display}-lock`);
            }
            catch {
            }
            try {
                unlinkSync(`/tmp/.X11-unix/X${display}`);
            }
            catch {
            }
        };
        const tryCleanup = () => {
            proc.removeListener("exit", tryCleanup);
            cleanupLock();
        };
        proc.once("exit", tryCleanup);
        proc.kill("SIGTERM");
        const shutdownTimer = setTimeout(() => {
            proc.removeListener("exit", tryCleanup);
            if (proc.exitCode === null && !proc.killed) {
                if (this.debug) {
                    console.log("Xvfb did not exit after SIGTERM, sending SIGKILL");
                }
                proc.kill("SIGKILL");
                cleanupLock();
            }
        }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
        if (!shutdownTimer.unref) {
            shutdownTimer.unref();
        }
    }
    static assert_linux() {
        if (OS_NAME !== "lin") {
            throw new VirtualDisplayNotSupported("Virtual display is only supported on Linux.");
        }
    }
}
