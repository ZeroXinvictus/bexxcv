import { describe, expect, test } from "vitest";
import { Bexxcv } from "../src";

describe("Chromium mode", () => {
 test("launches Playwright Chromium with Chrome UA", async () => {
  const browser = await Bexxcv({
   browser: "chromium",
   headless: true,
   os: "linux",
  });

  const page = await browser.newPage();
  const ua = await page.evaluate(() => navigator.userAgent);
  expect(ua).toMatch(/Chrome|Chromium/);

  await page.goto("https://example.com");
  const title = await page.title();
  expect(title).toContain("Example");

  await browser.close();
 }, 30e3);

 test("chromium_sandbox: false works", async () => {
  const browser = await Bexxcv({
   browser: "chromium",
   headless: true,
   chromium_sandbox: false,
  });

  const page = await browser.newPage();
  await page.goto("https://example.com");
  const title = await page.title();
  expect(title).toContain("Example");

  await browser.close();
 }, 30e3);

 test("Chromium mode does not leak Firefox markers", async () => {
  const browser = await Bexxcv({
   browser: "chromium",
   headless: true,
  });

  const page = await browser.newPage();
  await page.goto("https://example.com");

  const markers = await page.evaluate(() => ({
   hasChrome: typeof window !== "undefined" && "chrome" in window,
   ua: navigator.userAgent,
  }));

  // Headless Chrome may not have window.chrome in all versions
  expect(markers.ua).toMatch(/Chrome|Chromium/);
  expect(markers.ua).not.toMatch(/Firefox/);

  await browser.close();
 }, 30e3);
});
