import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (process.platform === "darwin") {
  const appName = "Runta Crew";
  const electronRoot = join(process.cwd(), "node_modules/electron");
  const dist = join(electronRoot, "dist");
  const brandedBundle = join(dist, `${appName}.app`);
  const stockBundle = join(dist, "Electron.app");
  const bundle = existsSync(brandedBundle) ? brandedBundle : stockBundle;
  const plist = join(bundle, "Contents/Info.plist");

  if (!existsSync(plist)) throw new Error(`Electron app bundle was not found at ${bundle}`);

  const macOSDirectory = join(bundle, "Contents/MacOS");
  const brandedExecutable = join(macOSDirectory, appName);
  if (!existsSync(brandedExecutable)) {
    const executable = readdirSync(macOSDirectory).find((entry) => statSync(join(macOSDirectory, entry)).isFile());
    if (!executable) throw new Error(`Electron executable was not found in ${macOSDirectory}`);
    renameSync(join(macOSDirectory, executable), brandedExecutable);
  }

  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    execFileSync("plutil", ["-replace", key, "-string", appName, plist]);
  }
  execFileSync("plutil", ["-replace", "CFBundleExecutable", "-string", appName, plist]);
  execFileSync("plutil", ["-replace", "CFBundleIdentifier", "-string", "com.runta.crew.dev", plist]);

  const localization = join(bundle, "Contents/Resources/en.lproj");
  mkdirSync(localization, { recursive: true });
  writeFileSync(
    join(localization, "InfoPlist.strings"),
    `"CFBundleName" = "${appName}";\n"CFBundleDisplayName" = "${appName}";\n`,
  );

  const launchServices = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  if (bundle !== brandedBundle) renameSync(bundle, brandedBundle);
  writeFileSync(join(electronRoot, "path.txt"), `${appName}.app/Contents/MacOS/${appName}`);
  if (existsSync(launchServices)) execFileSync(launchServices, ["-f", brandedBundle]);
}
