import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { getTmpPath } from "@/lib/storage";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);
const VOICE = process.env.TTS_VOICE || "vi-VN-HoaiMyNeural";

export async function generateVoice(
  segments: Array<{ start: number; end: number; textVi: string }>,
  voiceStyle: { speed?: number },
  jobId?: string
): Promise<string | undefined> {
  const items = (segments || []).filter((s) => s.textVi && String(s.textVi).trim().length > 0);
  if (items.length === 0) return undefined;

  const key = jobId || `tts_${Date.now()}`;
  const tmpDir = path.dirname(getTmpPath(key, ".voice.mp3"));
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const combined = getTmpPath(key, ".voice.mp3");
  const segFiles: string[] = [];

  try {
    // 1. synthesize each segment to mp3 via edge-tts (free, no API key; requires network)
    for (let i = 0; i < items.length; i++) {
      const segPath = getTmpPath(key, `-seg${i}.mp3`);
      const text = String(items[i].textVi).trim();
      try {
        await execFileAsync("edge-tts", ["--voice", VOICE, "--text", text, "--write-media", segPath], { timeout: 30000 });
        segFiles.push(segPath);
      } catch (e: any) {
        logger.warn({ seg: i, err: String(e.message) }, "edge-tts segment failed, skipping");
      }
    }
    if (segFiles.length === 0) {
      throw new Error(`edge-tts produced no audio for ${key}`);
    }
  } catch (e: any) {
    const isEnoent = e?.code === "ENOENT" || String(e.message).includes("ENOENT");
    if (isEnoent) {
      logger.warn({ voice: VOICE }, "edge-tts not found on PATH (pip install edge-tts) — voiceover disabled for this render");
    } else {
      logger.warn({ key, err: String(e.message) }, "edge-tts synthesis failed — voiceover disabled for this render");
    }
    for (const f of segFiles) { try { fs.unlinkSync(f); } catch {} }
    return undefined;
  }

  // 2. align each segment to its start time and mix into one voice track (bounded: no apad)
  try {
    const inputs: string[] = ["-y"];
    for (const f of segFiles) inputs.push("-i", f);
    const adelay = segFiles.map((_, i) => {
      const ms = Math.max(0, Math.round(items[i].start * 1000));
      return `[${i}:a]aresample=44100,adelay=${ms}|${ms}[a${i}]`;
    });
    const mix = `[${segFiles.map((_, i) => `a${i}`).join("][")}]amix=inputs=${segFiles.length}:normalize=0[aout]`;
    const filterComplex = `${adelay.join(";")};${mix}`;
    const total = Math.ceil(Math.max(...items.map((s) => s.end ?? 0))) + 1;
    await execFileAsync(
      "ffmpeg",
      [...inputs, "-filter_complex", filterComplex, "-map", "[aout]", "-t", String(total), "-c:a", "libmp3lame", "-q:a", "4", combined],
      { timeout: 60000 }
    );
    for (const f of segFiles) { try { fs.unlinkSync(f); } catch {} }
    const size = fs.existsSync(combined) ? fs.statSync(combined).size : 0;
    logger.info({ key, size, segments: segFiles.length, voice: VOICE }, "voice track generated");
    return combined;
  } catch (e: any) {
    logger.warn({ key, err: String(e.message) }, "voice mix failed — voiceover disabled for this render");
    for (const f of segFiles) { try { fs.unlinkSync(f); } catch {} }
    return undefined;
  }
}