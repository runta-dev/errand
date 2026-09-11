import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const metadata = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const appName = metadata.build.productName;
const appBundle = join(process.cwd(), "release/mac-arm64", `${appName}.app`);
const appBinary = join(appBundle, "Contents/MacOS", appName);
if (!existsSync(appBinary)) throw new Error(`Packaged app is missing: ${appBinary}`);
execFileSync("codesign", ["--verify", "--deep", "--strict", appBundle], { stdio: "pipe" });
const smokeRoot = mkdtempSync(join(tmpdir(), "errand-smoke-"));
const marker = join(smokeRoot, "ready");
const child = spawn(appBinary, [`--user-data-dir=${join(smokeRoot, "profile")}`], { env: { ...process.env, ERRAND_SMOKE_MARKER: marker }, stdio: "pipe" });
const deadline = Date.now() + 20_000;
while (!existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
if (!existsSync(marker)) { child.kill(); throw new Error("Packaged app did not finish loading within 20 seconds"); }
const result = JSON.parse(readFileSync(marker, "utf8"));
assert.equal(result.ready, true);
assert.equal(result.applicationName, appName, "Electron must use the Errand safeStorage keychain namespace");
assert.equal(result.userData, join(smokeRoot, "profile"));
assert.equal(result.sessionData, result.userData, "Browser data must stay in the selected profile");
assert.equal(result.windowTitle, appName);
assert.equal(new URL(result.rendererUrl).protocol, "file:");
assert.equal(result.rendererOrigin, "file://");
assert.equal(result.vncOrigin, result.rendererOrigin, "VNC must use the packaged renderer's native Origin");
console.log("Native smoke passed: Errand storage identity, isolated profile, and packaged VNC Origin verified.");
