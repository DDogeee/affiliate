import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { getTmpPath } from "@/lib/storage";
import { jobLogger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

export interface Segment { start: number; end: number; textZh: string }

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ASR_SCRIPT = path.join(SCRIPT_DIR, "whisper_asr.py");

function pythonCmd(): string {
  return process.platform === "win32" ? "python" : "python3";
}

async function extractWav(sourcePath: string, wav: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(wav), { recursive: true });
  await execFileAsync("ffmpeg", ["-y", "-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], { timeout: 120000 });
}

function probeDuration(sourcePath: string): Promise<number> {
  return execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", sourcePath], { timeout: 15000 }).then(
    (r) => parseFloat(r.stdout.trim()) || 0
  );
}

/** Groq Whisper (whisper-large-v3) — needs GROQ_API_KEY; returns null when unavailable/failing */
async function transcribeViaGroq(sourcePath: string, jobId: string): Promise<Segment[] | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const log = jobLogger(jobId, "asr");
  try {
    const wav = getTmpPath(jobId, ".groq.wav");
    await extractWav(sourcePath, wav);
    const buf = await fs.promises.readFile(wav);
    if (buf.byteLength > 24 * 1024 * 1024) throw new Error(`audio too large for Groq: ${buf.byteLength}`);
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: "audio/wav" }), "audio.wav");
    fd.append("model", process.env.GROQ_MODEL || "whisper-large-v3");
    fd.append("language", "zh");
    fd.append("response_format", "verbose_json");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (Array.isArray(data?.segments) && data.segments.length) {
      const segs = data.segments
        .map((s: any) => ({ start: s.start ?? 0, end: s.end ?? 0, textZh: (s.text ?? "").trim() }))
        .filter((s: Segment) => s.textZh && s.end > s.start);
      if (segs.length) return segs;
    }
    if (data?.text) {
      const dur = await probeDuration(sourcePath).catch(() => 0);
      return [{ start: 0, end: Math.max(3, dur || 3), textZh: String(data.text).trim() }];
    }
    return null;
  } catch (e: any) {
    try { log.warn({ jobId, err: String(e.message) }, "groq asr failed — falling back"); } catch {}
    return null;
  }
}

/** Local faster-whisper (CPU int8, model cached under STORAGE_BASE/tmp/whisper) */
async function transcribeLocalWhisper(jobId: string, sourcePath: string): Promise<Segment[] | null> {
  const log = jobLogger(jobId, "asr");
  try {
    const wav = getTmpPath(jobId, ".asr.wav");
    await extractWav(sourcePath, wav);
    const outJson = getTmpPath(jobId, ".asr.json");
    await fs.promises.mkdir(path.dirname(outJson), { recursive: true });
    await execFileAsync(pythonCmd(), [ASR_SCRIPT, wav, outJson], { timeout: 30 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 });
    const parsed = JSON.parse(fs.readFileSync(outJson, "utf-8")) as Array<{ start: number; end: number; text: string }>;
    const segs: Segment[] = (parsed || []).map((s) => ({ start: s.start, end: s.end, textZh: s.text }));
    return segs.length ? segs : null;
  } catch (e: any) {
    try { log.warn({ jobId, err: String(e.message) }, "local whisper asr failed — falling back"); } catch {}
    return null;
  }
}

export async function transcribe(jobId: string, sourcePath: string): Promise<Segment[]> {
  const log = jobLogger(jobId, "asr");
  const start = Date.now();
  if (process.env.ASR_DISABLE === "1" || process.env.ASR_DISABLE === "true") return mockSegments(log, jobId, start);
  if (!sourcePath || !fs.existsSync(sourcePath)) return mockSegments(log, jobId, start);

  // preferred: Groq Whisper (cloud, needs key)
  if (process.env.GROQ_API_KEY) {
    const g = await transcribeViaGroq(sourcePath, jobId);
    if (g && g.length) {
      try { log.info({ jobId, provider: "groq", count: g.length, durationMs: Date.now() - start }, "groq whisper asr done"); } catch {}
      return g;
    }
  }

  // fallback: local faster-whisper
  const local = await transcribeLocalWhisper(jobId, sourcePath);
  if (local && local.length) {
    try { log.info({ jobId, provider: "local-whisper", count: local.length, durationMs: Date.now() - start }, "local whisper asr done"); } catch {}
    return local;
  }

  try { log.warn({ jobId, durationMs: Date.now() - start }, "no ASR available — using 2-segment stub"); } catch {}
  return mockSegments(log, jobId, start);
}

function mockSegments(log: any, jobId: string, start: number): Segment[] {
  try { log.warn({ jobId, durationMs: Date.now() - start, mock: true }, "asr stub fallback"); } catch {}
  return [
    { start: 0, end: 3.5, textZh: "大家好，看看这个清洁工具" },
    { start: 3.5, end: 7.0, textZh: "非常实用，轻松清洁" },
  ];
}