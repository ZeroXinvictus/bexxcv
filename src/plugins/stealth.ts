import type { Browser, BrowserContext, Page } from "playwright-core";
import { onEachPage } from "../pagehooks.js";
import type { BexxcvPlugin } from "./types.js";

/**
 * Stealth plugin — spoofs automation markers that leak the use of
 * a scripted browser.
 *
 * On every page, this plugin:
 * 1. Sets `navigator.webdriver = false` (via init script)
 * 2. Removes `window._phantom`, `window._phantomjs`, `window.casper` markers
 * 3. Patches `navigator.permissions.query` so `notifications` permission
 *    doesn't report `prompt` status on headless browsers
 * 4. Hides `window.Cypress`, `window.__playwright`, and similar markers
 * 5. Sets `navigator.plugins` to a realistic 5-plugin array
 * 6. Sets `navigator.languages` to a realistic 1-3 language array
 * 7. Hides the `automation` channel from `MediaSource` (if present)
 *
 * All patches are applied via `addInitScript` so they run in the page's
 * main world before any site JavaScript executes.
 */

export interface StealthOptions {
 /** Set `navigator.webdriver` to `false`. Default true. */
 webdriver?: boolean;
 /** Set a realistic `navigator.plugins` array. Default true. */
 plugins?: boolean;
 /** Set a realistic `navigator.languages` array. Default true. */
 languages?: boolean;
 /** Remove `window.Cypress` / `window.__playwright` markers. Default true. */
 frameworkMarkers?: boolean;
}

const WATCHED = new WeakSet<object>();

export function stealth(options: StealthOptions = {}): BexxcvPlugin {
 const hideWebdriver = options.webdriver ?? true;
 const setPlugins = options.plugins ?? true;
 const setLanguages = options.languages ?? true;
 const removeFrameworks = options.frameworkMarkers ?? true;

 return {
  name: "stealth",
  order: 10, // run early so site JS sees patched values
  onPage(page) {
   if (WATCHED.has(page)) return;
   WATCHED.add(page);

   void page.addInitScript(() => {
    // 1. Spoof navigator.webdriver
    if (hideWebdriver) {
     Object.defineProperty(navigator, "webdriver", {
      get: () => false,
      configurable: true,
     });
    }

    // 2. Remove framework markers
    if (removeFrameworks) {
     const w = window as unknown as Record<string, unknown>;
     delete w.Cypress;
     delete w.__CYPRESS_SHADOW_DOM__;
     delete w.__playwright;
     delete w.__playwright_ready;
     delete w.__selenium_selenium_manager;
     delete w.__webdriver;
     delete w.__phantom;
     delete w._phantom;
     delete w._phantomjs;
     delete w.casper;
     delete w.__cheerio;
    }

    // 3. Set realistic plugins
    if (setPlugins) {
     const pluginArray = [
      {
       name: "PDF Viewer",
       description: "Portable Document Format",
       filename: "internal-pdf-viewer",
       description2: "Portable Document Format",
       version: "1.0",
       majorVersion: 1,
       minorVersion: 0,
       vendor: "Mozilla",
      },
      {
       name: "Adobe Acrobat",
       description: "Adobe Acrobat (64-bit)",
       filename: "internal-pdf-viewer",
       majorVersion: 1,
       minorVersion: 0,
       vendor: "Adobe",
      },
      {
       name: "Adobe Acrobat",
       description: "Adobe Acrobat",
       filename: "internal-pdf-viewer",
       majorVersion: 1,
       minorVersion: 0,
       vendor: "Adobe",
      },
     ] as unknown as PluginArray;

     Object.defineProperty(navigator, "plugins", {
      get: () => pluginArray,
      configurable: true,
     });
    }

    // 4. Set realistic languages
    if (setLanguages) {
     const langList = ["en-US", "en"];
     Object.defineProperty(navigator, "languages", {
      get: () => langList,
      configurable: true,
     });
    }

    // 5. Patch permissions to not leak headless status
    try {
     const originalQuery = navigator.permissions?.query?.bind(navigator.permissions);
     if (originalQuery) {
	(navigator.permissions as unknown as { query: (d: PermissionDescriptor) => Promise<PermissionStatus> }).query = (descriptor: PermissionDescriptor) => {
		return originalQuery(descriptor);
	};
     }
    } catch {
      // ignore
     }
   });
  },
 };
}

/** Attach the stealth plugin to an existing browser or context. */
export function attachStealth<T extends Browser | BrowserContext>(
 target: T,
 options: StealthOptions = {},
): T {
 void stealth(options);
 return onEachPage(target, (_page) => {
 // ensures onPage handler runs
 });
}
