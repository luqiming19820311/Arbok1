/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const rootDir = process.cwd();
  const standaloneSrc = path.join(rootDir, ".next", "standalone");
  if (!fs.existsSync(path.join(standaloneSrc, "server.js"))) {
    throw new Error(
      `Missing ${standaloneSrc}/server.js. Run \`npm run dist:prepare\` before electron-builder.`
    );
  }

  const productName = context.packager.appInfo.productFilename;
  const resourcesDir =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${productName}.app`,
          "Contents",
          "Resources"
        )
      : path.join(context.appOutDir, "resources");

  const standaloneDest = path.join(resourcesDir, "standalone");
  fs.rmSync(standaloneDest, { recursive: true, force: true });
  fs.mkdirSync(standaloneDest, { recursive: true });

  const entriesToCopy = [
    "server.js",
    "package.json",
    ".next",
    "public",
    "node_modules",
  ];

  for (const entry of entriesToCopy) {
    const src = path.join(standaloneSrc, entry);
    const dest = path.join(standaloneDest, entry);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true, dereference: false });
    }
  }

  // Ensure server runtime node_modules/next exists
  const nextPkg = path.join(standaloneDest, "node_modules", "next", "package.json");
  if (!fs.existsSync(nextPkg)) {
    throw new Error(`afterPack verification failed: missing ${nextPkg}`);
  }

  console.log(
    `[afterPack] Bundled Next.js standalone server + node_modules into ${standaloneDest}`
  );
};
