import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { dump } from "js-yaml";
import { compressDmgRelease } from "./compress-dmg.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function fixture({ version = "0.1.1", staleHash = false } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "crew-dmg-test-"));
  directories.push(directory);
  const image = "not a disk image";
  const manifest = dump({ version, files: [{ url: "Runta-Crew-0.1.1-arm64.dmg", size: image.length, sha512: staleHash ? "stale" : createHash("sha512").update(image).digest("base64") }], path: "existing.zip", sha512: "zip-hash", releaseNotes: "preserve notes" });
  const files = { "Runta Crew-0.1.1-arm64.dmg": image, "Runta Crew-0.1.1-arm64.dmg.blockmap": "original blockmap", "latest-mac.yml": manifest, "existing.zip": "original zip", "Old-0.0.1.dmg": "older release" };
  await Promise.all(Object.entries(files).map(([name, content]) => writeFile(path.join(directory, name), content)));
  return { directory, files };
}

async function expectUnchanged({ directory, files }) {
  expect((await readdir(directory)).sort()).toEqual(Object.keys(files).sort());
  for (const [name, content] of Object.entries(files)) expect(await readFile(path.join(directory, name), "utf8")).toBe(content);
}

it("refuses metadata from an older package before touching release artifacts", async () => {
  const value = await fixture({ version: "0.1.0" });
  await expect(compressDmgRelease(value.directory, "0.1.1")).rejects.toThrow("current package version");
  await expectUnchanged(value);
});

it("refuses a DMG that differs from the completed build metadata", async () => {
  const value = await fixture({ staleHash: true });
  await expect(compressDmgRelease(value.directory, "0.1.1")).rejects.toThrow("SHA512 mismatch");
  await expectUnchanged(value);
});

it("preserves the DMG, blockmap, ZIP, metadata, and older releases when image conversion fails", async () => {
  const value = await fixture();
  await expect(compressDmgRelease(value.directory, "0.1.1")).rejects.toThrow();
  await expectUnchanged(value);
});
