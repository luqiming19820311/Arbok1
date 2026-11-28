#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PKG_PATH = path.join(ROOT, "package.json");
const LOCK_PATH = path.join(ROOT, "package-lock.json");
const VERSION_TS_PATH = path.join(ROOT, "lib/arbok/version.ts");

function parseSemver(raw) {
  const m = String(raw)
    .trim()
    .replace(/^[vV]/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!m) return null;
  return {
    major: Number.parseInt(m[1], 10),
    minor: Number.parseInt(m[2], 10),
    patch: Number.parseInt(m[3], 10),
    prerelease: m[4] || "",
  };
}

function computeNextVersion(currentRaw, mode) {
  const cur = parseSemver(currentRaw);
  if (!cur) {
    throw new Error(`Invalid current version in package.json: ${currentRaw}`);
  }

  switch (mode) {
    case "patch":
      return `${cur.major}.${cur.minor}.${cur.patch + 1}`;
    case "minor":
      return `${cur.major}.${cur.minor + 1}.0`;
    case "major":
      return `${cur.major + 1}.0.0`;
    case "promote":
      if (!cur.prerelease) {
        throw new Error(
          `Current version ${currentRaw} is already a stable version; use patch/minor/major instead.`
        );
      }
      return `${cur.major}.${cur.minor}.${cur.patch}`;
    case "beta": {
      const betaMatch = cur.prerelease.match(/^beta\.(\d+)$/);
      if (betaMatch) {
        return `${cur.major}.${cur.minor}.${cur.patch}-beta.${Number.parseInt(betaMatch[1], 10) + 1}`;
      }
      return `${cur.major}.${cur.minor}.${cur.patch + 1}-beta.1`;
    }
    case "beta-minor":
      return `${cur.major}.${cur.minor + 1}.0-beta.1`;
    default: {
      const explicit = parseSemver(mode);
      if (!explicit) {
        throw new Error(
          `Unsupported bump argument "${mode}". Use: patch | minor | major | beta | beta-minor | promote | X.Y.Z[-beta.N]`
        );
      }
      return explicit.prerelease
        ? `${explicit.major}.${explicit.minor}.${explicit.patch}-${explicit.prerelease}`
        : `${explicit.major}.${explicit.minor}.${explicit.patch}`;
    }
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targetArg = args.find((a) => !a.startsWith("-"));

if (!targetArg || args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run release:bump -- <patch|minor|major|beta|beta-minor|promote|X.Y.Z[-beta.N]> [--dry-run]

Examples:
  npm run release:bump -- patch        # 0.2.1 -> 0.2.2 (Stable bugfix)
  npm run release:bump -- minor        # 0.2.1 -> 0.3.0 (Stable feature)
  npm run release:bump -- beta         # 0.2.1 -> 0.2.2-beta.1, or 0.3.0-beta.1 -> 0.3.0-beta.2
  npm run release:bump -- beta-minor   # 0.2.1 -> 0.3.0-beta.1
  npm run release:bump -- promote      # 0.3.0-beta.2 -> 0.3.0 (Promote Beta to Stable)
`);
  process.exit(targetArg ? 0 : 1);
}

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
const nextVersion = computeNextVersion(pkg.version, targetArg);
const isBeta = nextVersion.includes("-");
const tag = `v${nextVersion}`;
const branchHint = isBeta ? "beta" : "main";

console.log(
  `${dryRun ? "[dry-run] " : ""}Arbok version bump: ${pkg.version} -> ${nextVersion} (${isBeta ? "Beta / Pre-release" : "Stable Release"})`
);

if (!dryRun) {
  pkg.version = nextVersion;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");

  if (fs.existsSync(LOCK_PATH)) {
    const lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
    lock.version = nextVersion;
    if (lock.packages && lock.packages[""]) {
      lock.packages[""].version = nextVersion;
    }
    fs.writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + "\n", "utf8");
  }

  fs.writeFileSync(
    VERSION_TS_PATH,
    `export const APP_VERSION = "${nextVersion}";\n`,
    "utf8"
  );
}

console.log(`
Next steps to publish ${tag} (${isBeta ? "Pre-release -> Beta OTA channel" : "Official Release -> Stable OTA channel"}):
  1. npm run lint && npx tsc --noEmit && npm test
  2. git add package.json package-lock.json lib/arbok/version.ts
  3. git commit -m "chore(release): bump version to ${tag}"
  4. git tag ${tag}
  5. git push origin ${branchHint} ${tag}
`);
