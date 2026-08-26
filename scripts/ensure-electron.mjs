import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const electronDir = join(process.cwd(), "node_modules", "electron");
const manifest = JSON.parse(readFileSync(join(electronDir, "package.json"), "utf8"));
const platformPath = process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : process.platform === "win32" ? "electron.exe" : "electron";
const distDir = join(electronDir, "dist");
const executable = join(distDir, platformPath);
const installedVersion = join(distDir, "version");
const pathFile = join(electronDir, "path.txt");

if (existsSync(executable) && existsSync(installedVersion) && readFileSync(installedVersion, "utf8").trim().replace(/^v/, "") === manifest.version) {
  writeFileSync(pathFile, platformPath);
  process.exit(0);
}

const { downloadArtifact } = require("@electron/get");
const zipPath = await downloadArtifact({ version: manifest.version, artifactName: "electron", platform: process.platform, arch: process.arch });
mkdirSync(distDir, { recursive: true });

if (process.platform === "darwin") {
  const extracted = spawnSync("ditto", ["-x", "-k", zipPath, distDir], { stdio: "inherit" });
  if (extracted.status !== 0) throw new Error(`Could not extract Electron with ditto (exit ${extracted.status ?? "unknown"})`);
} else {
  const extract = require("extract-zip");
  await extract(zipPath, { dir: distDir });
}

if (!existsSync(executable)) throw new Error(`Electron executable is missing after extraction: ${executable}`);
writeFileSync(pathFile, platformPath);
