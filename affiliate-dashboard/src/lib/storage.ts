import fs from "fs";
import path from "path";

function getBase() {
  // Allow override for standalone build or tests; fallback to cwd/storage
  return process.env.STORAGE_BASE
    ? path.resolve(process.env.STORAGE_BASE)
    : path.join(process.cwd(), "storage");
}

export function ensureStorageDirs() {
  const base = getBase();
  for (const dir of ["source", "rendered", "tmp"]) {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
  }
}

export function getSourcePath(jobId: string) {
  return path.join(getBase(), "source", `${jobId}.mp4`);
}

export function getRenderedPath(jobId: string) {
  return path.join(getBase(), "rendered", `${jobId}.mp4`);
}

export function getTmpPath(jobId: string, suffix: string) {
  return path.join(getBase(), "tmp", `${jobId}${suffix}`);
}
