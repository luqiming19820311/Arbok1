import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, ".next", "standalone");
const staticSrc = path.join(rootDir, ".next", "static");
const staticDest = path.join(standaloneDir, ".next", "static");
const publicSrc = path.join(rootDir, "public");
const publicDest = path.join(standaloneDir, "public");
const leakedDataDir = path.join(standaloneDir, "data");

if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
  console.error(
    "Missing .next/standalone/server.js — run `npm run build` first."
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(staticDest), { recursive: true });
fs.rmSync(staticDest, { recursive: true, force: true });
fs.cpSync(staticSrc, staticDest, { recursive: true });

if (fs.existsSync(publicSrc)) {
  fs.rmSync(publicDest, { recursive: true, force: true });
  fs.cpSync(publicSrc, publicDest, { recursive: true });
}

// Never bundle local runtime data (SQLite DB, cached audio, local models)
if (fs.existsSync(leakedDataDir)) {
  fs.rmSync(leakedDataDir, { recursive: true, force: true });
}

console.log("Prepared Next.js standalone bundle for Electron packaging.");
