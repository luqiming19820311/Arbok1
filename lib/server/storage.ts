import fs from "node:fs";
import path from "node:path";
import type { StorageUsage } from "@/components/arbok/types";
import { getAppSettings } from "./db";
import { getAudioCacheDir } from "./env";

function getBaseDataDir(): string {
  return process.env.ARBOK_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function getOfflineDir(): string {
  return (
    process.env.ARBOK_OFFLINE_DIR ?? path.join(getBaseDataDir(), "offline")
  );
}

export function getLocalMediaDir(): string {
  return (
    process.env.ARBOK_LOCAL_MEDIA_DIR ??
    path.join(getBaseDataDir(), "local-media")
  );
}

interface ScannedFile {
  filePath: string;
  size: number;
  lastUsedMs: number;
}

function scanDirectoryFiles(dir: string): ScannedFile[] {
  if (!fs.existsSync(dir)) return [];
  const results: ScannedFile[] = [];
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          results.push({
            filePath: fullPath,
            size: stat.size,
            lastUsedMs: Math.max(stat.atimeMs, stat.mtimeMs),
          });
        } catch {
          // Skip files removed concurrently.
        }
      }
    }
  }
  return results;
}

function removeEmptySubdirs(rootDir: string): void {
  if (!fs.existsSync(rootDir)) return;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(rootDir, entry.name);
    removeEmptySubdirs(sub);
    try {
      if (fs.readdirSync(sub).length === 0) {
        fs.rmdirSync(sub);
      }
    } catch {
      // Ignore concurrent fs changes.
    }
  }
}

export function bytesToMb(bytes: number): number {
  if (bytes <= 0) return 0;
  return Number((bytes / (1024 * 1024)).toFixed(1));
}

export function inspectStorageUsage(): StorageUsage {
  const tempFiles = scanDirectoryFiles(getAudioCacheDir());
  const offlineFiles = scanDirectoryFiles(getOfflineDir()).filter(
    (f) => !f.filePath.endsWith(".part")
  );
  const localFiles = scanDirectoryFiles(getLocalMediaDir());

  const tempCacheBytes = tempFiles.reduce((acc, f) => acc + f.size, 0);
  const offlineBytes = offlineFiles.reduce((acc, f) => acc + f.size, 0);
  const localMediaBytes = localFiles.reduce((acc, f) => acc + f.size, 0);
  const settings = getAppSettings();

  return {
    tempCacheBytes,
    tempCacheMb: bytesToMb(tempCacheBytes),
    offlineBytes,
    offlineMb: bytesToMb(offlineBytes),
    offlineCount: offlineFiles.length,
    localMediaBytes,
    localMediaMb: bytesToMb(localMediaBytes),
    limitMb: settings.cacheLimitMb,
  };
}

export function enforceTempCacheLruLimit(limitMb: number): {
  evictedFiles: string[];
  freedBytes: number;
  usage: StorageUsage;
} {
  const maxBytes = Math.max(0, Math.floor(limitMb * 1024 * 1024));
  const tempDir = getAudioCacheDir();
  const files = scanDirectoryFiles(tempDir);
  let totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  if (totalBytes <= maxBytes) {
    return {
      evictedFiles: [],
      freedBytes: 0,
      usage: inspectStorageUsage(),
    };
  }

  files.sort((a, b) => a.lastUsedMs - b.lastUsedMs);

  const evictedFiles: string[] = [];
  let freedBytes = 0;

  for (const file of files) {
    if (totalBytes <= maxBytes) break;
    try {
      fs.unlinkSync(file.filePath);
      totalBytes -= file.size;
      freedBytes += file.size;
      evictedFiles.push(file.filePath);
    } catch {
      // Ignore files locked or already removed.
    }
  }

  removeEmptySubdirs(tempDir);

  return {
    evictedFiles,
    freedBytes,
    usage: inspectStorageUsage(),
  };
}

export function clearTempCache(): {
  clearedBytes: number;
  usage: StorageUsage;
} {
  const tempDir = getAudioCacheDir();
  const files = scanDirectoryFiles(tempDir);
  let clearedBytes = 0;

  for (const file of files) {
    try {
      fs.unlinkSync(file.filePath);
      clearedBytes += file.size;
    } catch {
      // Ignore concurrent removal.
    }
  }
  removeEmptySubdirs(tempDir);

  return {
    clearedBytes,
    usage: inspectStorageUsage(),
  };
}
