import { describe, expect, it } from "vitest";
import { developerIdIdentity, releaseCredentials, signingCommandFailure, verifyGatekeeperAssessment, verifySignatureDetails } from "./package-release.mjs";

describe("Apple release admission", () => {
  it("identifies credential command failures without echoing native credential output", () => {
    const failure = signingCommandFailure("security", "import", 1, "SecKeychainItemImport: MAC verification failed during PKCS12 import secret-material", true);
    expect(failure).toContain("security import failed");
    expect(failure).toContain("APPLE_CERTIFICATE_PASSWORD");
    expect(failure).not.toContain("secret-material");
    expect(signingCommandFailure("security", "unlock-keychain", 1, "unknown secret-material", true)).not.toContain("secret-material");
    const unknown = signingCommandFailure("security", "import", 1, "security: SecKeychainItemImport: Unable to decode the provided data. secret-material\nunrelated output", true, ["secret-material"]);
    expect(unknown).toContain("Unable to decode the provided data.");
    expect(unknown).not.toContain("secret-material");
    expect(unknown).not.toContain("unrelated output");
  });

  it("reports missing configuration names without echoing credential material", () => {
    expect(() => releaseCredentials({ APPLE_CERTIFICATE_BASE64: "private-certificate" })).toThrow("APPLE_CERTIFICATE_PASSWORD");
    expect(() => releaseCredentials({ APPLE_CERTIFICATE_BASE64: "private-certificate" })).not.toThrow("private-certificate");
  });

  it("requires a unique distribution identity with a private key", () => {
    const hash = "A".repeat(40);
    const valid = `  1) ${hash} "Developer ID Application: Runta (ABCDE12345)"\n     1 valid identities found`;
    expect(developerIdIdentity(valid)).toBe(hash);
    expect(() => developerIdIdentity(valid.replace("Developer ID Application", "Apple Development"))).toThrow();
    expect(() => developerIdIdentity("0 valid identities found")).toThrow();
    expect(() => developerIdIdentity(`${valid}\n${valid}`)).toThrow();
  });
});

describe("distributed app signature verification", () => {
  const signed = "Identifier=com.runta.crew\nCodeDirectory v=20500 size=100 flags=0x10000(runtime) hashes=1+7 location=embedded\nAuthority=Developer ID Application: Runta (ABCDE12345)\nTeamIdentifier=ABCDE12345\nTimestamp=Sep 10, 2026 at 12:00:00\n";

  it("rejects the previously shipped linker signature", () => {
    expect(() => verifySignatureDetails("Identifier=Electron\nSignature=adhoc\nTeamIdentifier=not set\nInfo.plist=not bound", { application: true })).toThrow();
  });

  it("requires the app identity, hardened runtime, and a secure timestamp", () => {
    expect(() => verifySignatureDetails(signed, { application: true })).not.toThrow();
    for (const bad of [signed.replace("(runtime)", "(adhoc)"), signed.replace("com.runta.crew", "Electron"), signed.replace(/^Timestamp=.*\n/m, ""), signed.replace("TeamIdentifier=ABCDE12345", "TeamIdentifier=not set")]) {
      expect(() => verifySignatureDetails(bad, { application: true })).toThrow();
    }
  });

  it("does not mistake disabled local Gatekeeper for a successful release assessment", () => {
    expect(() => verifyGatekeeperAssessment("Errand.app: accepted\nsource=Notarized Developer ID\n")).not.toThrow();
    expect(() => verifyGatekeeperAssessment("Errand.app: accepted\noverride=security disabled\n")).toThrow();
    expect(() => verifyGatekeeperAssessment("Errand.app: accepted\nsource=Developer ID\n")).toThrow();
  });
});
