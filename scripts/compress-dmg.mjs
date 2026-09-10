import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { buildBlockMap } from "app-builder-lib/out/targets/blockmap/blockmap.js";
import { dump, load } from "js-yaml";

const execute = promisify(execFile);
const artifactName = (url) => path.basename(decodeURIComponent(new URL(url, "https://artifacts.invalid/").pathname));
const sha512 = async (file) => {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("base64");
};
async function imageChecksum(file) {
  const { stdout } = await execute("hdiutil", ["checksum", "-type", "SHA256", file]);
  const checksum = stdout.match(/SHA256\s+\$([a-f\d]{64})/i)?.[1];
  assert.ok(checksum, "hdiutil did not return a decoded-image SHA256");
  return checksum.toLowerCase();
}

async function replacePrepared(files, staging) {
  const backups = [];
  try {
    for (const [index, { source, destination }] of files.entries()) {
      const backup = path.join(staging, `backup-${index}`);
      let existed = true;
      try { await rename(destination, backup); } catch (error) { if (error.code !== "ENOENT") throw error; existed = false; }
      backups.push({ destination, backup: existed ? backup : undefined });
      await rename(source, destination);
    }
  } catch (error) {
    try {
      for (const entry of backups.reverse()) {
        await rm(entry.destination, { force: true });
        if (entry.backup) await rename(entry.backup, entry.destination);
      }
    } catch (rollbackError) {
      throw Object.assign(new AggregateError([error, rollbackError], `Could not restore artifacts; backups retained at ${staging}`), { retainStaging: true });
    }
    throw error;
  }
}

export async function compressDmgRelease(outputDirectory, version, { finalizeImage } = {}) {
  const directory = path.resolve(outputDirectory);
  const manifestFile = path.join(directory, "latest-mac.yml");
  const originalManifest = await readFile(manifestFile, "utf8");
  const manifest = load(originalManifest);
  assert.equal(manifest?.version, version, "latest-mac.yml must describe the current package version");
  assert.ok(Array.isArray(manifest.files), "latest-mac.yml must list release files");
  const entries = manifest.files.filter((entry) => typeof entry.url === "string" && artifactName(entry.url).endsWith(".dmg"));
  assert.ok(entries.length, "latest-mac.yml contains no current DMG artifacts");
  const diskImages = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".dmg")).map((entry) => entry.name);
  const selected = [];
  for (const entry of entries) {
    const name = artifactName(entry.url);
    const matches = diskImages.filter((file) => file === name || file.replaceAll(" ", "-") === name);
    assert.equal(matches.length, 1, `Expected one local DMG for ${name}`);
    const file = path.join(directory, matches[0]);
    assert.ok(!selected.some((item) => item.file === file), "DMG appears more than once in release metadata");
    const originalStat = await stat(file);
    assert.equal(originalStat.size, entry.size, `Size mismatch for ${name}`);
    assert.equal(await sha512(file), entry.sha512, `SHA512 mismatch for ${name}`);
    selected.push({ entry, file, name, originalStat });
  }

  const staging = await mkdtemp(path.join(directory, ".dmg-compression-"));
  let retainStaging = false;
  try {
    const prepared = [];
    for (const [index, item] of selected.entries()) {
      const converted = path.join(staging, `${index}.dmg`);
      const blockmap = `${converted}.blockmap`;
      const originalImageChecksum = await imageChecksum(item.file);
      await execute("hdiutil", ["convert", item.file, "-format", "ULMO", "-imagekey", "lzma-level=9", "-o", converted]);
      await execute("hdiutil", ["verify", converted]);
      assert.equal((await execute("hdiutil", ["imageinfo", "-format", converted])).stdout.trim(), "ULMO");
      assert.equal(await imageChecksum(converted), originalImageChecksum, "Compression changed the disk image contents");
      // Signing and stapling mutate the container; complete them before hashing
      // the downloadable artifact or generating its differential-update map.
      if (finalizeImage) await finalizeImage(converted);
      // The explicit third argument creates a sidecar, without appending data to the DMG.
      const info = await buildBlockMap(converted, "gzip", blockmap);
      assert.equal(info.size, (await stat(converted)).size);
      assert.equal(info.sha512, await sha512(converted));
      const map = JSON.parse(gunzipSync(await readFile(blockmap)));
      assert.equal(map.version, "2");
      assert.equal(map.files.flatMap((file) => file.sizes).reduce((sum, size) => sum + size, 0), info.size);
      item.entry.sha512 = info.sha512;
      item.entry.size = info.size;
      if (typeof manifest.path === "string" && artifactName(manifest.path) === item.name) {
        manifest.sha512 = info.sha512;
        if ("size" in manifest) manifest.size = info.size;
      }
      prepared.push({ source: converted, destination: item.file }, { source: blockmap, destination: `${item.file}.blockmap` });
    }
    const nextManifest = dump(manifest, { lineWidth: -1, noRefs: true });
    assert.deepEqual(load(nextManifest), manifest, "Release metadata did not round-trip");
    const stagedManifest = path.join(staging, "latest-mac.yml");
    await writeFile(stagedManifest, nextManifest);
    // Refuse to replace a different build that appeared while compression ran.
    assert.equal(await readFile(manifestFile, "utf8"), originalManifest, "Release metadata changed during compression");
    for (const item of selected) {
      const current = await stat(item.file);
      assert.ok(current.ino === item.originalStat.ino && current.size === item.originalStat.size && current.mtimeMs === item.originalStat.mtimeMs, "DMG changed during compression");
    }
    prepared.push({ source: stagedManifest, destination: manifestFile });
    await replacePrepared(prepared, staging);
    for (const item of selected) console.log(`Compressed ${path.basename(item.file)} with ULMO level 9: ${item.originalStat.size} → ${item.entry.size} bytes`);
  } catch (error) {
    retainStaging = error.retainStaging === true;
    throw error;
  } finally {
    if (!retainStaging) await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const metadata = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
  await compressDmgRelease(process.argv[2] ?? path.resolve(project, metadata.build?.directories?.output ?? "release"), metadata.version);
}
