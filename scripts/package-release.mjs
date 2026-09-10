import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { build, Platform, Arch } from "electron-builder";
import { compressDmgRelease } from "./compress-dmg.mjs";

const execute = promisify(execFile);
export const requiredReleaseEnvironment = ["APPLE_CERTIFICATE_BASE64", "APPLE_CERTIFICATE_PASSWORD", "APPLE_NOTARY_KEY_BASE64", "APPLE_NOTARY_KEY_ID", "APPLE_NOTARY_ISSUER_ID"];

export function releaseCredentials(env) {
  const missing = requiredReleaseEnvironment.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing Apple release configuration: ${missing.join(", ")}`);
  return Object.fromEntries(requiredReleaseEnvironment.map((name) => [name, env[name]]));
}

export function developerIdIdentity(output) {
  const matches = [...output.matchAll(/\b([A-Fa-f0-9]{40})\s+"Developer ID Application: [^"\n]+"/g)];
  assert.equal(matches.length, 1, "The certificate must contain exactly one valid Developer ID Application identity with its private key");
  return matches[0][1];
}

export function verifySignatureDetails(details, { application = false } = {}) {
  assert.match(details, /^Authority=Developer ID Application: .+/m, "Expected a Developer ID Application signature");
  assert.match(details, /^TeamIdentifier=[A-Z0-9]{10}$/m, "Expected an Apple developer team");
  assert.match(details, /^Timestamp=.+/m, "Expected a secure signing timestamp");
  if (application) {
    assert.match(details, /^Identifier=com\.runta\.crew$/m);
    assert.match(details, /^CodeDirectory .*\bruntime\b/m, "Expected hardened runtime");
  }
}

export function verifyGatekeeperAssessment(output) {
  assert.match(output, /^source=Notarized Developer ID$/m, "Gatekeeper must accept the notarized signature, not a local security override");
}

export function signingCommandFailure(command, operation, code, stderr, sensitive) {
  const label = command === "security" ? `${command} ${operation}` : command;
  let detail = stderr || "";
  if (sensitive) {
    // Report known native diagnostics without ever copying arbitrary output from
    // a credential-handling command (or execFile's argv-bearing error message).
    const diagnostics = [
      ["MAC verification failed", "PKCS#12 password verification failed; check APPLE_CERTIFICATE_PASSWORD."],
      ["Unknown format", "The certificate is not a supported PKCS#12 export; check APPLE_CERTIFICATE_BASE64."],
      ["User interaction is not allowed", "The signing keychain requires interaction."],
      ["specified keychain already exists", "The temporary signing keychain already exists."],
      ["specified keychain could not be found", "The temporary signing keychain could not be found."],
      ["specified item could not be found", "The signing keychain item could not be found."],
      ["One or more parameters", "macOS rejected a signing keychain parameter."]
    ];
    detail = diagnostics.find(([native]) => detail.includes(native))?.[1] ?? "Native diagnostic omitted because this command handles credentials.";
  }
  return `${label} failed (exit ${code ?? "unknown"})${detail ? `\n${detail}` : ""}`;
}

export async function packageRelease() {
  const credentials = releaseCredentials(process.env);
  assert.equal(process.platform, "darwin", "Signed macOS releases must be built on macOS");
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const metadata = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
  const output = path.join(project, "release");
  const staging = await mkdtemp(path.join(tmpdir(), "runta-crew-signing-"));
  const keychain = path.join(staging, "signing.keychain-db");
  const certificate = path.join(staging, "developer-id.p12");
  const notaryKey = path.join(staging, "AuthKey.p8");
  const keychainPassword = randomBytes(32).toString("base64");
  let keychainCreated = false;
  let originalKeychains;
  // Do not let inherited signing/debug variables override the release policy or
  // propagate certificate material into build subprocesses or diagnostic logs.
  const originalEnvironment = { ...process.env };
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("APPLE_") || name.startsWith("CSC_") || name === "DEBUG") delete process.env[name];
  }
  const run = async (command, args, { sensitive = false } = {}) => {
    try { return await execute(command, args, { cwd: project, maxBuffer: 16 * 1024 * 1024 }); }
    catch (error) {
      // execFile's error message includes argv, including keychain passwords.
      throw new Error(signingCommandFailure(command, args[0], error.code, error.stderr || error.stdout, sensitive));
    }
  };
  const verifySignature = async (file, application = false) => {
    await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", file]);
    const result = await run("codesign", ["--display", "--verbose=4", file]);
    verifySignatureDetails(result.stderr, { application });
  };
  const notarize = async (file) => {
    console.log(`Submitting ${path.basename(file)} for Apple notarization…`);
    const result = await run("xcrun", ["notarytool", "submit", file, "--key", notaryKey, "--key-id", credentials.APPLE_NOTARY_KEY_ID, "--issuer", credentials.APPLE_NOTARY_ISSUER_ID, "--wait", "--timeout", "30m", "--output-format", "json"]);
    const submission = JSON.parse(result.stdout);
    assert.equal(submission.status, "Accepted", `Apple notarization failed: ${submission.status} (submission ${submission.id})`);
    console.log(`Apple notarization accepted: ${submission.id}`);
  };
  const staple = async (file) => {
    // Apple's ticket can take a short time to become available after Accepted.
    for (let attempt = 0; ; attempt++) {
      try { await run("xcrun", ["stapler", "staple", file]); break; }
      catch (error) { if (attempt === 3) throw error; await delay(5_000); }
    }
    await run("xcrun", ["stapler", "validate", file]);
  };
  const verifyApp = async (file) => {
    await verifySignature(file, true);
    await run("xcrun", ["stapler", "validate", file]);
    const assessment = await run("spctl", ["--assess", "--type", "execute", "--verbose=2", file]);
    verifyGatekeeperAssessment(assessment.stdout + assessment.stderr);
  };
  try {
    await writeFile(certificate, Buffer.from(credentials.APPLE_CERTIFICATE_BASE64, "base64"), { mode: 0o600 });
    await writeFile(notaryKey, Buffer.from(credentials.APPLE_NOTARY_KEY_BASE64, "base64"), { mode: 0o600 });
    await run("security", ["create-keychain", "-p", keychainPassword, keychain], { sensitive: true });
    keychainCreated = true;
    await run("security", ["set-keychain-settings", "-lut", "7200", keychain]);
    await run("security", ["unlock-keychain", "-p", keychainPassword, keychain], { sensitive: true });
    await run("security", ["import", certificate, "-P", credentials.APPLE_CERTIFICATE_PASSWORD, "-T", "/usr/bin/codesign", "-t", "cert", "-f", "pkcs12", "-k", keychain], { sensitive: true });
    await run("security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-k", keychainPassword, keychain], { sensitive: true });
    originalKeychains = (await run("security", ["list-keychains", "-d", "user"])).stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line.trim()));
    await run("security", ["list-keychains", "-d", "user", "-s", keychain, ...originalKeychains]);
    const identity = developerIdIdentity((await run("security", ["find-identity", "-v", "-p", "codesigning", keychain])).stdout);
    process.env.CSC_KEYCHAIN = keychain;
    console.log((await run("npm", ["run", "build"])).stdout);
    let appVerified = false;
    await build({
      projectDir: project,
      targets: Platform.MAC.createTarget(["dmg", "zip"], Arch.arm64),
      publish: "never",
      config: {
        forceCodeSigning: true,
        mac: { identity, type: "distribution", hardenedRuntime: true, strictVerify: true, entitlements: "build/entitlements.mac.plist", entitlementsInherit: "build/entitlements.mac.plist", notarize: false },
        dmg: { sign: false },
        afterSign: async ({ appOutDir }) => {
          const app = path.join(appOutDir, "Runta Crew.app");
          await verifySignature(app, true);
          const archive = path.join(staging, "Runta Crew.zip");
          await run("ditto", ["-c", "-k", "--keepParent", app, archive]);
          await notarize(archive);
          await staple(app);
          await verifyApp(app);
          appVerified = true;
        }
      }
    });
    assert.ok(appVerified, "The app must be signed, notarized, and stapled before packaging");
    await compressDmgRelease(output, metadata.version, {
      finalizeImage: async (file) => {
        await run("codesign", ["--force", "--timestamp", "--keychain", keychain, "--sign", identity, file]);
        await verifySignature(file);
        await notarize(file);
        await staple(file);
        await verifySignature(file);
        await run("hdiutil", ["verify", file]);
        const assessment = await run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=2", file]);
        verifyGatekeeperAssessment(assessment.stdout + assessment.stderr);
        const mount = path.join(staging, "dmg-mount");
        await run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, file]);
        try { await verifyApp(path.join(mount, "Runta Crew.app")); }
        finally {
          try { await run("hdiutil", ["detach", mount]); }
          catch { await delay(1_000); await run("hdiutil", ["detach", mount]); }
        }
      }
    });
    // Check the ZIP's embedded app too: a valid expanded build alone does not
    // prove that either downloadable container carries the stapled signature.
    const zip = path.join(output, `Runta Crew-${metadata.version}-arm64-mac.zip`);
    const extracted = path.join(staging, "zip-check");
    await run("ditto", ["-x", "-k", zip, extracted]);
    await verifyApp(path.join(extracted, "Runta Crew.app"));
    console.log("Release verified: Developer ID signatures, Apple tickets, DMG and ZIP contents.");
  } finally {
    try { if (originalKeychains) await run("security", ["list-keychains", "-d", "user", "-s", ...originalKeychains]); }
    finally {
      try { if (keychainCreated) await run("security", ["delete-keychain", keychain], { sensitive: true }); }
      finally {
        try { await rm(staging, { recursive: true, force: true }); }
        finally {
          for (const name of Object.keys(process.env)) if (!(name in originalEnvironment)) delete process.env[name];
          Object.assign(process.env, originalEnvironment);
        }
      }
    }
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { await packageRelease(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
