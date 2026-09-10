import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const appBinary = join(process.cwd(), "release/mac-arm64/Runta Crew.app/Contents/MacOS/Runta Crew");
if (!existsSync(appBinary)) throw new Error(`Packaged app is missing: ${appBinary}`);
execFileSync("codesign", ["--verify", "--deep", "--strict", join(process.cwd(), "release/mac-arm64/Runta Crew.app")], { stdio: "pipe" });
const smokeRoot = mkdtempSync(join(tmpdir(), "runta-crew-smoke-"));
const marker = join(smokeRoot, "ready");
const child = spawn(appBinary, [`--user-data-dir=${join(smokeRoot, "profile")}`], { env: { ...process.env, RUNTA_CREW_SMOKE_MARKER: marker }, stdio: "pipe" });
const deadline = Date.now() + 20_000;
while (!existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
if (!existsSync(marker)) { child.kill(); throw new Error("Packaged app did not finish loading within 20 seconds"); }
const result = JSON.parse(readFileSync(marker, "utf8"));
assert.equal(result.ready, true);
assert.equal(new URL(result.rendererUrl).protocol, "file:");
assert.equal(result.rendererOrigin, "file://");
assert.equal(result.vncOrigin, result.rendererOrigin, "VNC must use the packaged renderer's native Origin");
console.log("Native smoke passed: packaged renderer loaded with the correct VNC Origin.");
