/**
 * Rendering a look to a PNG with the browser already on the machine.
 *
 * The surface is a WebGL shader, so a picture of it needs a browser. Hosting
 * one to render for strangers costs money and seconds; but this server runs on
 * the user's own computer, which almost always has Chrome, Edge, Brave or
 * Chromium installed. So it drives that one, headless, through the DevTools
 * protocol — nothing to download, nothing to pay for — and renders the same
 * `<liquid-forge>` element a Webflow page would, from the copy of the library
 * installed alongside this server.
 */

import { existsSync, readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Browser } from "puppeteer-core"

export function findBrowser(): string | null {
  const fromEnv = process.env.LIQUIDFORGE_BROWSER
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const candidates: string[] = []
  if (process.platform === "darwin") {
    for (const root of ["/Applications", join(homedir(), "Applications")]) {
      candidates.push(
        `${root}/Google Chrome.app/Contents/MacOS/Google Chrome`,
        `${root}/Chromium.app/Contents/MacOS/Chromium`,
        `${root}/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`,
        `${root}/Brave Browser.app/Contents/MacOS/Brave Browser`,
        `${root}/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary`,
      )
    }
  } else if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean) as string[]
    for (const root of roots) {
      candidates.push(
        join(root, "Google", "Chrome", "Application", "chrome.exe"),
        join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
        join(root, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        join(root, "Chromium", "Application", "chrome.exe"),
      )
    }
  } else {
    for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"]) {
      try {
        const found = execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
        if (found) candidates.push(found)
      } catch {
        // Not installed under that name.
      }
    }
    candidates.push("/snap/bin/chromium", "/usr/bin/chromium", "/usr/bin/google-chrome")
  }
  return candidates.find((path) => existsSync(path)) ?? null
}

let elementScript: string | null = null
function loadElementScript(): string {
  if (!elementScript) {
    const require = createRequire(import.meta.url)
    elementScript = readFileSync(require.resolve("liquidforge/element.global.js"), "utf8")
  }
  return elementScript
}

let browser: Browser | null = null
let idle: ReturnType<typeof setTimeout> | undefined

async function getBrowser(executablePath: string): Promise<Browser> {
  if (idle) clearTimeout(idle)
  // One browser for a burst of renders, closed a minute after the last one so a
  // long agent session does not leave Chrome running in the background.
  idle = setTimeout(() => {
    void browser?.close().catch(() => {})
    browser = null
  }, 60_000)
  idle.unref?.()
  if (browser?.connected) return browser
  const puppeteer = await import("puppeteer-core")
  browser = await puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check"],
  })
  return browser
}

export interface RenderRequest {
  /** `[name, value]` attribute pairs for `<liquid-forge>`, as `elementAttributes` produces. */
  attributes: Array<[string, string | true]>
  width: number
  height: number
  transparent: boolean
  /** Hover here first, in -1..1 across the object, so the render shows the surface reacting. */
  pointer?: { x: number; y: number }
  timeoutMs?: number
}

export async function renderPng(request: RenderRequest): Promise<Buffer> {
  const executablePath = findBrowser()
  if (!executablePath) {
    throw new Error(
      "No Chrome, Edge, Brave or Chromium found. Install one, or set LIQUIDFORGE_BROWSER to the path of a Chromium-based browser.",
    )
  }
  const instance = await getBrowser(executablePath)
  const page = await instance.newPage()
  try {
    await page.setViewport({ width: request.width, height: request.height, deviceScaleFactor: 1 })
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
    const attributes = request.attributes
      .map(([name, value]) => (value === true ? name : `${name}="${escape(value)}"`))
      .join(" ")
    // The listener goes in before the element exists — a word forges in a few
    // milliseconds, and "ready" can fire before a listener added afterwards —
    // and inline, because setContent replaces the document and takes any
    // listener installed beforehand with it.
    const listen = `<script>window.__ready = new Promise(function (resolve) {
      document.addEventListener("ready", function () { resolve("ready") }, { capture: true, once: true });
      document.addEventListener("error", function (event) { resolve("error: " + String(event.detail)) }, { capture: true, once: true });
    })</script>`
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${request.transparent ? "transparent" : "#000"}}</style>` +
        `${listen}<script>${loadElementScript()}</script></head><body>` +
        `<liquid-forge ${attributes} style="display:block;width:${request.width}px;height:${request.height}px"></liquid-forge>` +
        `</body></html>`,
      { waitUntil: "load" },
    )
    const outcome = await Promise.race([
      page.evaluate("window.__ready") as Promise<string>,
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), request.timeoutMs ?? 45_000)),
    ])
    if (outcome !== "ready") throw new Error(outcome === "timeout" ? "The object took too long to load" : String(outcome || "The page did not start"))

    if (request.pointer) {
      const x = ((request.pointer.x + 1) / 2) * request.width
      const y = ((1 - request.pointer.y) / 2) * request.height
      await page.mouse.move(x, y, { steps: 8 })
      await new Promise((resolve) => setTimeout(resolve, 1400))
    } else {
      await new Promise((resolve) => setTimeout(resolve, 700))
    }

    const image = await page.screenshot({ type: "png", omitBackground: request.transparent, clip: { x: 0, y: 0, width: request.width, height: request.height } })
    return Buffer.from(image)
  } finally {
    await page.close().catch(() => {})
  }
}

export async function closeRenderer(): Promise<void> {
  if (idle) clearTimeout(idle)
  await browser?.close().catch(() => {})
  browser = null
}
