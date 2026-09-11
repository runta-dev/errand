import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (process.platform === "darwin") {
  const metadata = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const appName = metadata.build.productName;
  const electronRoot = join(process.cwd(), "node_modules/electron");
  const dist = join(electronRoot, "dist");
  const brandedBundle = join(dist, `${appName}.app`);
  const pathFile = join(electronRoot, "path.txt");
  const selectedName = existsSync(pathFile) ? readFileSync(pathFile, "utf8").trim().split("/")[0] : "Electron.app";
  const candidates = [selectedName, `${appName}.app`, "Runta Crew.app", "Electron.app"];
  const selectedBundle = candidates.find((name) => ["Electron.app", "Runta Crew.app", `${appName}.app`].includes(name) && existsSync(join(dist, name, "Contents/Info.plist")));
  if (!selectedBundle) throw new Error("Electron app bundle was not found. Run npm install first.");
  const bundle = join(dist, selectedBundle);
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
  execFileSync("plutil", ["-replace", "CFBundleIdentifier", "-string", `${metadata.build.appId}.dev`, plist]);

  const localization = join(bundle, "Contents/Resources/en.lproj");
  mkdirSync(localization, { recursive: true });
  writeFileSync(
    join(localization, "InfoPlist.strings"),
    `"CFBundleName" = "${appName}";\n"CFBundleDisplayName" = "${appName}";\n`,
  );

  const launchServices = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  if (bundle !== brandedBundle) {
    rmSync(brandedBundle, { recursive: true, force: true });
    renameSync(bundle, brandedBundle);
  }
  writeFileSync(join(electronRoot, "path.txt"), `${appName}.app/Contents/MacOS/${appName}`);
  if (existsSync(launchServices)) execFileSync(launchServices, ["-f", brandedBundle]);
}
