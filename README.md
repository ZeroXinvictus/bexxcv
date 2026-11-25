# bexxcv

Headless Firefox automation with realistic browser fingerprints, built on top of [Camoufox](https://github.com/daijro/camoufox).

> **Fork notice:** Forked from [camoufox-js](https://github.com/apify/camoufox-js) by [Apify]. Full credit to the original authors for the architecture, fingerprint generation pipeline, and Playwright integration. This fork adds entropy improvements, GPU-aware WebGL sampling, session management, and ergonomic enhancements.
>
> **v1.1.4:** Enhanced fingerprint realism (canvas anti-aliasing offset, audio sample-rate jitter, performance clock drift), expanded 2024–2026 GPU profiles, six new Cloudflare-aware plugins (`jsd`, `ephemeral`, `precursor`, `classify`, `botscore`, `brake`), and improved JSD challenge detection that only activates on real Cloudflare challenge pages.

---

## What's different from camoufox-js

| Area | Original | bexxcv |
|---|---|---|
| IP resolution | Sequential fallback (up to 6s on cold start) | `Promise.any()` — all endpoints race, fastest wins |
| Randomness source | `Math.random()` | `crypto.getRandomValues()` everywhere |
| `window.devicePixelRatio` | Not injected (always 1.0) | Injected per-OS from real-world telemetry distribution |
| DPR coherence | Chosen independently of screen size | Selected so CSS × DPR matches a known monitor resolution |
| Window position | Perfectly centered | Organic ±20px jitter + upper-biased Y placement |
| Download retries | Flat delay | Exponential backoff with crypto jitter (2s → 4s → 8s → max 30s) |
| Xvfb trigger | `headless: "virtual"` only | `headless: false` auto-starts Xvfb when `$DISPLAY` is unset |
| WebGL sampling | `Math.random()` for weighted choice | `crypto.getRandomValues()` with OS-weighted GPU profiles |
| Turnstile solver | Manual | `turnstile: true` — background checkbox clicker per page |
| Cloudflare UAM | Manual | `uam: true` — waits until challenge clears before continuing |
| Human behavior | Cursor movement only (`humanize`) | `attachHumanBehavior(page)` — typed sessions with drift, typos, fatigue |
| Launch speed | Sequential setup | Public IP lookup runs in parallel with binary check; telemetry off by default |
| Fingerprint seeds | Plain random | Audio, canvas, font-spacing, WebGL vendor/renderer from per-GPU database |
| Hardware concurrency | Fixed / not spoofed | Spoofed from realistic pool per target OS |
| Device memory | Not set | Injected from fingerprint-derived multiplier |
| Timezone | Exact UTC offset | ±15 min jitter for realism |

---

## Requirements

- Node.js >= 22
- `playwright-core` < 1.63.0
- Linux headless: `Xvfb` (install via package manager if needed)

---

## Installation

```bash
npm install bexxcv playwright-core
# or
pnpm add bexxcv playwright-core
```

Fetch the Camoufox browser binary after installing:

```bash
npx bexxcv fetch
```

---

## Basic usage

```ts
import { bexxcv } from "bexxcv";

const browser = await bexxcv({ headless: true });
const page = await browser.newPage();
await page.goto("https://example.com");
await browser.close();
```

On a headless Linux server without `$DISPLAY`, Xvfb starts automatically when `headless` is `false` or unset — no `xvfb-run` wrapper required.

---

## Options

```ts
const browser = await bexxcv({
  // --- Display ---
  headless: false,      // false | true | "virtual"
  auto_xvfb: true,      // auto-start Xvfb on Linux without $DISPLAY

  // --- OS targeting ---
  os: "windows",        // "linux" | "macos" | "windows" | array

  // --- Fingerprint customization ---
  fingerprint: undefined,       // pass a custom Fingerprint object
  ff_version: undefined,        // override Firefox version in UA string
  screen: undefined,            // { maxWidth, maxHeight } — constrain physical screen
  window: undefined,            // [width, height] — fix outer window dimensions
  webgl_config: undefined,      // [vendor, renderer] — pick specific WebGL pair
  hardware_concurrency_override: undefined, // override CPU thread count
  device_memory_override: undefined,        // override navigator.deviceMemory
  timezone_jitter: true,        // ±15 min offset noise (default on)
  perf_jitter: true,            // performance.now() clock drift (default on)
  session_stickiness: true,     // keep values consistent within a session (default on)

  // --- Network / locale ---
  geoip: true,                  // true = detect public IP; string = use specific IP
  locale: "en-US",              // BCP 47 locale string or array
  proxy: "http://user:pass@host:port",

  // --- Privacy toggles ---
  block_webrtc: false,          // disable WebRTC (prevents STUN-based IP leaks)
  block_images: false,          // disable image loading
  block_webgl: false,           // disable WebGL entirely
  disable_coop: false,          // disable Cross-Origin-Opener-Policy

  // --- Browser behavior ---
  humanize: false,              // true | number(ms) — random mouse delays
  turnstile: false,             // auto-click Turnstile checkboxes
  uam: false,                   // wait out Cloudflare UAM challenges
  enable_cache: false,          // enable disk + memory cache
  main_world_eval: false,       // allow JS eval in main world

  // --- Cloudflare / anti-bot plugins (v1.1.4) ---
classify: true, // auto-detect Cloudflare challenge type per response (default)
jsd: true, // intercept JSD challenges, wait for cf_clearance (auto-activates on CF pages)
ephemeral: true, // capture & replay Turnstile ephemeral IDs (default)
precursor: true, // detect cf_ cookie drift between navigations (default)
botScore: false, // monitor Cloudflare bot score per page
brake: false, // rate-limit navigation after CF 403/429 responses
gauntlet: false, // run a full fingerprint audit gauntlet before each page
wiretap: false, // intercept & log network requests/responses
stash: false, // persist fingerprint state to a file for reuse across runs
veneer: false, // apply a visual "veneer" of extra browser-like CSS properties
cocoon: false, // sandboxed session isolation
dodge: false, // avoid re-challenge by rotating ephemeral identifiers
lens: false, // run the lens audit on each page (fingerprint consistency check)
human: false, // attach human-like behavior wrapper per page

// --- Addons & fonts ---
  addons: [],                   // paths to Firefox extension XPIs
  exclude_addons: [],           // built-in addon keys to skip
  fonts: [],                    // additional font names to inject
  custom_fonts_only: false,     // strip built-in fonts, use only your list

  // --- Low-level ---
  executable_path: undefined,   // path to a custom Firefox binary
  firefox_user_prefs: {},       // raw Firefox about:config prefs
  args: [],                     // extra CLI args passed to Firefox
  env: {},                      // extra environment variables
  debug: false,                 // print full config before launch
});
```

### `headless`

| Value | Behavior |
|---|---|
| `true` | Pure headless — no display needed |
| `false` (default) | Visible window. On Linux with no `$DISPLAY`, auto-starts Xvfb |
| `"virtual"` | Explicit virtual display regardless of `$DISPLAY` state |

### `os`

Restricts the fingerprint generator to browsers seen on the given OS(es). Affects UA string, `navigator.platform`, `navigator.oscpu`, screen dimensions, and font set.

```ts
await bexxcv({ os: "windows" });
await bexxcv({ os: ["windows", "macos"] });
```

### `geoip`

Detects the server's public IP and aligns geolocation fields (timezone, locale, language headers). Combine with `proxy` to match the proxy exit node.

```ts
await bexxcv({ geoip: true });
await bexxcv({ geoip: "203.0.113.45" });
await bexxcv({ proxy: "socks5://user:pass@proxy.example.com:1080", geoip: true });
```

Requires the optional `geoip2` extra.

### `screen`

Constrains the generated physical screen size. The width/height are treated as physical pixel bounds; the final CSS pixels depend on the selected DPR.

```ts
await bexxcv({ screen: { maxWidth: 1920, maxHeight: 1080 } });
```

### `webgl_config`

Override the WebGL vendor/renderer pair. Use the exported helper to list valid combinations:

```ts
import { getPossiblePairs, sampleGPUProfile, KNOWN_GPUS } from "bexxcv";
// or
await bexxcv({ webgl_config: ["Intel Inc.", "Intel Iris OpenGL Engine"] });
```

### `turnstile`

Background solver for Cloudflare Turnstile checkboxes.

```ts
const browser = await bexxcv({ turnstile: true });
```

Per-page loop. Looks for `cf-turnstile-response` inputs, clicks the checkbox area, scrolls into view if needed, and skips already-solved widgets. Works alongside `humanize`.

Options: `{ interval: 1000, retryAfter: 8000 }` (defaults shown).

### `uam`

Waits out Cloudflare "Just a moment" pages.

```ts
const browser = await bexxcv({ uam: true });
```

Options: `{ timeout: 30000, interval: 1500, waitOnGoto: true }`. Pages without a challenge return immediately.

Can be combined with `turnstile`.

---

## Cloudflare plugins (v1.1.4)

bexxcv ships six Cloudflare-aware plugins that are enabled by default (or opt-in). Each plugin integrates via the `PluginOptions` interface and is built into the browser context by `buildPlugins()`.

### `classify` — challenge-classify (default: `true`)

Reads HTTP responses and page titles to detect which Cloudflare anti-bot layer fired. Classifies as `jsd`, `managed`, `interactive`, `non_interactive`, `turnstile`, `rate_limit`, or `bot_score_low`. Results are cached per-response and exposed via `challengeInfoFor(response)` and `pageChallengeHistory(page)`.

```ts
import { bexxcv, challengeInfoFor } from "bexxcv";

const browser = await bexxcv({ classify: true });
// On response inspection:
const page = await browser.newPage();
const resp = await page.goto("https://protected-site.com");
const info = challengeInfoFor(resp);
if (info.type === "managed") console.log("Managed challenge detected");
```

### `jsd` — JS Detection handler (default: `true`)

Intercepts `page.goto()` and detects real Cloudflare JavaScript Detection challenges by checking for:
- "Just a moment" / "Attention required" page titles
- `window.cloudflare.jsd` with `state === "pending"` (only when Cloudflare itself injected the namespace)

If a challenge is detected, polls for `cf_clearance` cookie or JSD state transition. Pages without a Cloudflare challenge pass through instantly — no 15s penalty.

```ts
import { bexxcv, isJsdPassed } from "bexxcv";

const browser = await bexxcv({
  jsd: { timeout: 20_000, interval: 500 },
});
const page = await browser.newPage();
await page.goto("https://protected-site.com");
const passed = await isJsdPassed(page);
```

Options: `{ timeout?: number, interval?: number }`

### `ephemeral` — Turnstile ephemeral ID tracking (default: `true`)

Captures `ephemeral_id` from Turnstile responses and replays it on subsequent navigations to reduce re-challenge frequency. Stored per-context with a 10-minute TTL.

```ts
import { bexxcv, getEphemeralEntries, replayEphemeral } from "bexxcv";

const browser = await bexxcv({
  ephemeral: { autoReplay: true, maxAgeMs: 1_800_000 },
});
const context = (browser as any).contexts()[0];
const entries = getEphemeralEntries(context);
```

### `precursor` — cookie drift detection (default: `true`)

Watches `cf_` prefixed cookies on every navigation and response. When `cf_clearance` stays the same but a precursor cookie value changes, it signals a stale session. Emits a warning and optionally auto-reloads.

```ts
import { bexxcv, getPrecursorState } from "bexxcv";

const browser = await bexxcv({
  precursor: { warn: true, autoReload: true },
});
const page = await browser.newPage();
await page.goto("https://protected-site.com");
const state = getPrecursorState(page);
```

Options: `{ warn?: boolean, autoReload?: boolean, names?: string[] }`

### `botScore` — bot score monitor (default: `false`)

Periodically checks Cloudflare's bot score via the page's `window.__cfBotScore` (when available) and logs the value. Useful for debugging why a site is issuing managed challenges.

```ts
import { bexxcv, getBotScores, hadLowScore } from "bexxcv";

const browser = await bexxcv({ botScore: { log: true } });
const page = await browser.newPage();
await page.goto("https://protected-site.com");
const scores = getBotScores(page);
if (hadLowScore(page, 40)) console.log("Bot score was low — expect challenges");
```

### `brake` — rate limiter with CF 403 support (default: `false`)

Intercepts `page.goto()` and applies exponential backoff when Cloudflare returns HTTP 403 or 429. Prevents rapid re-challenge loops.

```ts
import { bexxcv, brake } from "bexxcv";

const browser = await bexxcv({
  brake: { maxRetries: 3, baseDelayMs: 2000 },
});
```

Options: `{ maxRetries?: number, baseDelayMs?: number }`

### `stealth` — automation marker spoofing (default: `false`)

Patches `navigator.webdriver`, `navigator.plugins`, `navigator.languages`, and removes framework markers (`window.Cypress`, `window.__playwright`, `window._phantom`, etc.) via `addInitScript`. All patches run in the page's main world before any site JavaScript executes.

```ts
import { bexxcv, stealth, attachStealth } from "bexxcv";

// Use as a launch option:
const browser = await bexxcv({
  stealth: {
    webdriver: true,
    plugins: true,
    languages: true,
    frameworkMarkers: true,
  },
});

// Or attach to an existing browser:
attachStealth(browser, { webdriver: true });
```

Options: `{ webdriver?: boolean, plugins?: boolean, languages?: boolean, frameworkMarkers?: boolean }`

---

## Fingerprint quality (v1.1.4)

bexxcv generates fingerprints with per-GPU WebGL data, canvas anti-aliasing offsets, audio sample-rate jitter, and performance clock drift. The fingerprint pipeline:

1. **OS selection** — picks a Firefox version, platform, and screen size from a weighted pool
2. **DPR coherence** — selects a device pixel ratio such that CSS × DPR matches a known monitor resolution
3. **WebGL sampling** — queries `webgl_data.db` for vendor/renderer pairs weighted by OS and GPU generation (2024–2026 hardware included)
4. **Canvas AA offset** — applies a per-GPU anti-aliasing sub-pixel offset to `canvasAaOffset`
5. **Audio jitter** — applies `audioSampleRateJitter` (±0.5 Hz) to the Web Audio API clock
6. **Perf jitter** — applies Gaussian `perfJitterSigma` drift to `performance.now()`
7. **Font spacing** — picks a font rendering seed from a weighted list per OS

```ts
import { generateFingerprint, sampleGPUProfile, resolveUAOS } from "bexxcv";

const fp = generateFingerprint([1920, 1080], {
  operatingSystems: ["windows"],
  canvasAaOffset: true,
  audioSampleRateJitter: true,
  perfJitterSigma: 0.15,
});
console.log(fp.webglVendor, fp.webglRenderer, fp.canvasAaOffset);

const gpu = sampleGPUProfile("linux");
console.log(gpu.vendor, gpu.renderer);

const os = resolveUAOS(gpu.vendor, gpu.renderer);
console.log(os); // "linux" | "windows" | "macos"
```

---

## Session API

Bexxcv maintains per-page session state for consistent fingerprinting and human-like behavior across multiple page navigations.

```ts
import { attachHumanBehavior, getSessionInfo, initSession, advancePage, endSession } from "bexxcv";

const browser = await bexxcv({ headless: true });
const page = await browser.newPage();

// Initialize a session tied to this page
initSession(page);

// Attach human-like behavior (mouse drift, typing delays, page transition pacing)
attachHumanBehavior(page, { speed: 1, idleDrift: true });

await page.goto("https://example.com/page1");
advancePage(page); // increment session page counter

const info = getSessionInfo(page);
console.log(info.id, info.pageCount, info.ageMs);

await page.goto("https://example.com/page2");
endSession(page); // clean up
await browser.close();
```

### `initSession(page, options?)`

Creates a new session bound to the page. Returns a session ID string. Sessions track a random seed buffer used for reproducible seeded randomness across page loads.

Options: `{ timeout?: number, maxPages?: number, seedLength?: number }`

### `getSessionId(page)`

Returns the current session ID for a page, or `null` if none exists.

### `advancePage(page)`

Increments the page counter for the active session. Called automatically by `attachHumanBehavior` during navigation.

### `endSession(page)`

Removes session state from the page and cleans up internal maps.

### `isSessionExpired(page, timeoutMs?)`

Returns `true` if the session age exceeds `timeoutMs` (default 30 minutes).

### `attachHumanBehavior(page, options?)`

Wraps `page.goto()`, `page.click()`, and `page.evaluate()` with human-like timing. Uses seeded Gaussian drift for idle cursor movement based on the session seed.

Options:
| Option | Default | Description |
|---|---|---|
| `speed` | `1` | Multiplier for all delays (lower = faster) |
| `typoRate` | `0.015` | Probability of random character errors in typed text |
| `scrollPattern` | `"natural"` | Scroll pattern type |
| `idleDrift` | `true` | Subtle cursor drift while idle |
| `sessionTimeout` | `1800000` | Session expiry in ms |
| `maxPagesPerSession` | `20` | Max pages before session expires |
| `pageTransitionMinMs` | `800` | Min delay between page loads |
| `pageTransitionMaxMs` | `3000` | Max delay between page loads |
| `mouseAcceleration` | `true` | Accelerate cursor toward targets |

### `detachHumanBehavior(page)`

Reverses the wrappers applied by `attachHumanBehavior`.

### `getSessionInfo(page)`

Returns `{ id, pageCount, ageMs }` or `null` if no session exists.

---

## Fingerprint internals

### GPU profile sampling

Each fingerprint includes a randomly-selected but OS-weighted GPU profile. Known GPUs are stored in `KNOWN_GPUs` per OS, with weights reflecting typical market share. The same GPU profile determines both the `webGl:vendor`/`webGl:renderer` fingerprint properties and the GLSL shader version string.

Optional WebGL extensions are added probabilistically per OS. The full list lives in `src/webgl/profiles.ts` and can be extended.

### Screen DPI coherence

`devicePixelRatio` is sampled from an OS-specific pool, then validated so that `CSS_width × DPR` and `CSS_height × DPR` each land on a known physical monitor resolution. Invalid combinations receive near-zero weight, making impossible resolutions statistically negligible.

### Extended fingerprint fields

Beyond the standard `fingerprint-generator` output, bexxcv adds these internal fields to the generated fingerprint object:

| Field | Purpose |
|---|---|
| `audioSeed` | Seed for audio context fingerprinting |
| `canvasSeed` | Seed for canvas fingerprint noise patterns |
| `fontSpacingSeed` | Seed for font measurement spacing jitter |
| `webglVendor` | Physical GPU vendor name |
| `webglRenderer` | Physical GPU renderer string |
| `webglGLSL` | Corresponding GLSL version |
| `webglExtensions` | Supported WebGL extension list |
| `hardwareConcurrencySeed` | CPU core count selection |
| `memoryMultiplier` | RAM multiplier for `navigator.deviceMemory` |
| `perfJitter` | `performance.now()` clock drift offset |
| `timezoneOffsetJitter` | Timezone offset shift in seconds |
| `touchSupport` | Whether touch input is reported |
| `pointerType` | Primary pointer type ("mouse"/"touch"/"pen") |

These fields are consumed during config assembly when the installed Camoufox build supports the corresponding properties (checked against the build's `properties.json`). Older builds that lack a property simply skip it.

---

## Plugins

bexxcv ships a set of pluggable behaviors you can compose:

| Plugin | What it does |
|---|---|
| `brake` | Rate-limits requests with exponential backoff |
| `cocoon` | Persists browser profile data to disk |
| `dodge` | Rotates through a proxy pool with health checks |
| `gauntlet` | Runs sustained challenge-solving loops |
| `human` | Wraps page interactions with human-like timing |
| `lens` | Audits fingerprint properties for consistency |
| `stash` | Saves cookies/localStorage to JSON files |
| `veneer` | Strips unnecessary fingerprint properties |
| `wiretap` | Logs network request/response details |

See individual plugin documentation for configuration options.

---

## Lens Fingerprint Audit

The `lens` plugin audits the running browser's fingerprint in real time and reports any inconsistencies:

```ts
import { bexxcv, lens, lensReport } from "bexxcv";

const browser = await bexxcv({ headless: true });
const page = await browser.newPage();
await page.goto("https://example.com");

// The lens plugin runs automatically when added to plugins
const report = lensReport(page);
if (report) {
  console.log(`Score: ${report.score}/100`);
  for (const check of report.checks) {
    if (!check.ok) console.log(`  ❌ ${check.id}: ${check.detail}`);
  }
}
```

Run the audit manually on any page:

```ts
import { auditFingerprint } from "bexxcv";

const report = await auditFingerprint(page);
```

### Checks performed

| Check ID | What it validates |
|---|---|
| `webdriver` | `navigator.webdriver` is `undefined` / falsy |
| `ua-platform` | `navigator.platform` matches OS in UA string |
| `language` | First language in `navigator.languages` equals `navigator.language` |
| `locale-intl` | `Intl.DateTimeFormat()` locale matches `navigator.language` prefix |
| `dpr-screen` | CSS × DPR lands on a known physical monitor resolution |
| `window-size` | inner ≤ outer ≤ screen + 16 px (Chrome frame buffer) |
| `cores` | hardwareConcurrency is a plausible CPU core count |
| `touch` | `maxTouchPoints` is 0 on desktop UAs |
| `webgl` | WebGL vendor/renderer are present and non-null |
| `webgl-software` | Renderer is not a software fallback (llvmpipe/swiftshader) |
| `native-code` | Core APIs have `[native code]` toString output |
| `ua-hints` | `userAgentData` absent for Firefox, present for Chrome-like UAs |
| `chrome-object` | `window.chrome` absent for Firefox |
| `pdf-viewer` | `navigator.pdfViewerEnabled` is `true` on Firefox |
| `focus` | Page is focused and visible |
| `media-devices` | At least one media device or headless timeout fallback |
| `audio-sample-rate` | `AudioContext.sampleRate` is 44100 or 48000 |
| `fonts-enumerated` | `document.fonts.size > 0` and no load error |
| `webgl-shader-precision` | Highp float shader precision ≥ 23 (desktop GPU) |
| `client-hints-platform` | `userAgentData.platform` consistent with `navigator.platform` |

---

## Context Isolation

Every Playwright `browserContext` gets an independent fingerprint, storage, and cookies. Cross-context leakage is guarded by test coverage:

```ts
import { Camoufox } from "bexxcv";

const browser = await Camoufox({ headless: true });

const ctxA = await browser.newContext();
const ctxB = await browser.newContext();

const pageA = await ctxA.newPage();
const pageB = await ctxB.newPage();

await pageA.goto("https://example.com");
await pageB.goto("https://example.com");

// localStorage set in A is invisible from B
await pageA.evaluate(() => localStorage.setItem("key", "secret-a"));
const leaked = await pageB.evaluate(() => localStorage.getItem("key"));
console.log(leaked); // null ✓
```

Tests are in `test/isolation.test.ts`.

---

## Behavioral Seeding

Beyond raw fingerprint properties, bexxcv seeds high-level behavioral signals that detectors flag as suspicious when missing or default:

| Property Group | What Gets Seeded | Realism Logic |
|---|---|---|
| **Battery** | `battery:level`, `charging`, `dischargingTime` | Desktop → full & discharging; Laptop/Mac → 20–95% with ~25% charging state |
| **Media devices** | `mediaDevices:micros/webcams/speakers` | OS-weighted pools: mics [0-2], cams [0-2], speakers [0-4] |
| **Speech voices** | `voices[]`, `blockIfNotDefined`, `fakeCompletion` | 2–10 voices matching locale language |
| **Do Not Track** | `navigator.doNotTrack` | ~20% of real users enable DNT |
| **GPC** | `navigator.globalPrivacyControl` | ~10% signal GPC |
| **Referrer policy** | Firefox pref `privacy.referrer_policy` | Same-Origin on cross-origin for non-headless |
| **Online/cookies** | `navigator.onLine`, `cookieEnabled` | Almost always online and cookies enabled |

These are applied automatically when the installed Camoufox build supports the corresponding properties. Run `npx bexxcv doctor` to see your build's supported properties.

---

## Persistent context

```ts
import { bexxcv } from "bexxcv";

const context = await bexxcv({
  user_data_dir: "./browser-profile",
  headless: false,
});

const page = await context.newPage();
await page.goto("https://example.com");
await context.close();
```

A persisted profile survives restarts. Note: sharing profiles across different OS fingerprints may leak inconsistencies.

---

## Scripting helpers

The `getPossiblePairs()`, `sampleGPUProfile()`, and `resolveUAOS()` functions are exported for advanced use cases:

```ts
import { getPossiblePairs, generateFingerprint, getRealisticFonts, resolveUAOS } from "bexxcv";

const pairs = await getPossiblePairs();
console.log(pairs.windows[0]); // { vendor: "...", renderer: "..." }

const gpu = sampleGPUProfile("linux");
console.log(gpu.vendor, gpu.renderer);

const fp = generateFingerprint([1280, 720], { operatingSystems: ["linux"] });
console.log(fp.screen.width, fp.audioSeed, fp.webglVendor);
```

---

## Troubleshooting

### `UnknownProperty` — unsupported config key

Some fingerprint properties aren't supported by older Camoufox builds. Run `npx bexxcv doctor` to see which properties your installed build supports. Properties not in `properties.json` are skipped automatically when using the default fingerprint pipeline.

### `VirtualDisplayError` — Xvfb not found

Install Xvfb on your system:

```bash
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install -y xvfb

# Alpine Linux
apk add xvfb-run

# Fedora / RHEL
dnf install xorg-x11-server-Xvfb
```

### `CamoufoxNotInstalled` — binary missing

```bash
npx bexxcv fetch
```

Pre-provisioned binary (Docker / CI):
```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
CAMOUFOX_INSTALL_DIR=/path/to/your/binary
```

### `UnsupportedVersion` — outdated binary

```bash
npx bexxcv fetch
```

### `CorruptedDownload` — checksum mismatch

```bash
npx bexxcv remove
npx bexxcv fetch
# or manually:
rm -rf ~/.cache/camoufox
npx bexxcv fetch
```

### `UnsupportedArchitecture` — platform not supported

Supported matrix:

| OS | Architectures |
|---|---|
| Linux | `x86_64`, `arm64`, `i686` |
| macOS | `x86_64`, `arm64` |
| Windows | `x86_64`, `i686` |

### `MissingRelease` — GitHub rate limit or network issue

**Fix — add a GitHub token:**
```bash
GITHUB_TOKEN=ghp_your_token npx bexxcv fetch
```

Unauthenticated GitHub API is limited to 60 requests/hour per IP.

### `WebGL database not found or empty`

The package ships `webgl_data.db` inside `dist/data-files`. If you see this error while developing bexxcv itself, place a valid `webgl_data.db` in `src/data-files` and run `pnpm build` again.

### `playwright-core` version mismatch

bexxcv requires `playwright-core < 1.63.0`.

**Fix:**
```bash
npm install playwright-core@1.62.1
```

### Node.js version too old

bexxcv requires Node.js >= 22.

**Fix:**
```bash
node --version
nvm install 22 && nvm use 22
```

### `InvalidProxy` — proxy format wrong

Proxy must be `protocol://[user:password@]host:port`:

```ts
await bexxcv({
  proxy: "http://user:pass@proxy.example.com:8080",
});
```

### `NonFirefoxFingerprint` — wrong browser fingerprint

You passed a fingerprint generated for Chrome or Safari. bexxcv only accepts Firefox fingerprints.

**Fix:** regenerate with `browsers: ["firefox"]`, or pass `i_know_what_im_doing: true` if you're intentionally mixing (detection risk).

---

## License

MPL-2.0 — same as the upstream [camoufox-js](https://github.com/apify/camoufox-js).
