import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { getTmpPath } from "@/lib/storage";
import { jobLogger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

export interface OcrSegment { start: number; end: number; textZh: string }

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OCR_SCRIPT = path.join(SCRIPT_DIR, "ocr_subs.py");

function pythonCmd(): string {
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Extract burned-in subtitles from the detected subtitle band via OCR.
 * Returns timed Chinese segments; empty array when no subs are readable.
 */
export async function extractHardSubs(jobId: string, sourcePath: string, top: number, bottom: number): Promise<OcrSegment[]> {
  const log = jobLogger(jobId, "ocr");
  const start = Date.now();
  try {
    const outJson = getTmpPath(jobId, ".ocr.json");
    await fs.promises.mkdir(path.dirname(outJson), { recursive: true });
    await execFileAsync(pythonCmd(), [OCR_SCRIPT, sourcePath, String(top), String(bottom), outJson], {
      timeout: 8 * 60 * 1000,
      maxBuffer: 16 * 1024 * 1024,
    });
    const raw = fs.readFileSync(outJson, "utf-8");
    const parsed = JSON.parse(raw) as Array<{ start: number; end: number; text: string }>;
    const segments: OcrSegment[] = (parsed || []).map((s) => ({ start: s.start, end: s.end, textZh: s.text }));
    try { log.info({ jobId, count: segments.length, durationMs: Date.now() - start }, "hard-sub OCR done"); } catch {}
    return segments;
  } catch (e: any) {
    const missing = e?.code === "ENOENT" || /tesseract/.test(String(e.message));
    try { log.warn({ jobId, err: String(e.message), missing, durationMs: Date.now() - start }, "hard-sub OCR failed"); } catch {}
    return [];
  }
}

/** Legacy stub OCR — final fallback only */
export async function extractOcr(jobId: string, sourcePath: string): Promise<OcrSegment[]> {
  return [
    { start: 0, end: 3.5, textZh: "强力清洁" },
    { start: 3.5, end: 7.0, textZh: "家务必备" },
  ];
}