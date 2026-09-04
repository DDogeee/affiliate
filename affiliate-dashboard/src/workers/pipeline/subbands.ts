import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "@/lib/logger";

const execFileAsync = promisify(execFile);

export interface SubtitleBand {
  /** vertical band as fractions of frame height, 0=top 1=bottom */
  top: number;
  bottom: number;
}

const SEGMENTS = 20; // 5%-height segments
const STROKE_THRESHOLD = 60; // row max-stddev that counts as text-like
const PERSISTENCE = 0.7; // fraction of sampled frames that must show the segment

/**
 * Detect a burned-in subtitle band by TEMPORAL PERSISTENCE:
 * subtitles sit at a fixed vertical zone and reappear across frames, while
 * busy scene content at any one band fluctuates. We sample frames across the
 * video and keep 5% segments whose max row-stddev stays high in most frames.
 */
export async function detectSubtitleBand(sourcePath: string): Promise<SubtitleBand | null> {
  const envBand = process.env.SUBTITLE_BAND;
  if (envBand) {
    const [a, b] = envBand.split(",").map((s) => parseFloat(s) / 100);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a && a >= 0 && b <= 1) {
      logger.info({ band: `${a * 100}%–${b * 100}%`, source: "env" }, "subtitle band override");
      return { top: a, bottom: b };
    }
    logger.warn({ band: envBand }, "invalid SUBTITLE_BAND, ignoring");
  }

  const W = 320;
  const H = 240;
  const dur = await probeDuration(sourcePath).catch(() => 60);
  if (dur < 2) return null;

  const n = 8;
  const times = Array.from({ length: n }, (_, i) => Math.max(0.8, ((i + 0.5) / n) * dur)).filter((t) => t < dur - 0.4);
  if (times.length < 4) return null;

  // max row-stddev per 5% segment, per frame
  const segLen = Math.floor(H / SEGMENTS);
  const pers: number[] = new Array(SEGMENTS).fill(0);
  let okFrames = 0;
  for (const t of times) {
    const pgm = await sampleGray(sourcePath, t, W, H).catch(() => null);
    if (!pgm) continue;
    okFrames++;
    for (let s = 0; s < SEGMENTS; s++) {
      let mx = 0;
      for (let k = 0; k < segLen; k++) mx = Math.max(mx, rowStddev(pgm, W, s * segLen + k));
      if (mx >= STROKE_THRESHOLD) pers[s]++;
    }
  }
  if (okFrames < 3) return null;
  const need = Math.max(2, Math.ceil(okFrames * PERSISTENCE));

  // find contiguous runs of persistent segments; prefer the bottom-most
  let best: { top: number; bottom: number; score: number } | null = null;
  let runStart = -1;
  for (let s = 0; s <= SEGMENTS; s++) {
    const hot = s < SEGMENTS && pers[s] >= need;
    if (hot && runStart === -1) runStart = s;
    if ((!hot || s === SEGMENTS) && runStart !== -1) {
      const score = (s - runStart) * 100 + 60 - runStart; // prefer lower position on tie-ish
      if (s - runStart >= 2 && (!best || runStart > best.top * SEGMENTS || score > best.score)) {
        best = { top: runStart / SEGMENTS, bottom: s / SEGMENTS, score };
      }
      runStart = -1;
    }
  }

  if (!best) return null;
  const top = Math.max(0, best.top - 0.015);
  const bottom = Math.min(1, best.bottom + 0.02);
  return { top, bottom };
}

function probeDuration(sourcePath: string): Promise<number> {
  return execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", sourcePath], { timeout: 15000 }).then(
    (r) => parseFloat(r.stdout.trim()) || 0
  );
}

async function sampleGray(sourcePath: string, atSec: number, W: number, H: number): Promise<Buffer | null> {
  const r = await execFileAsync(
    "ffmpeg",
    ["-ss", String(atSec), "-i", sourcePath, "-frames:v", "1", "-vf", `scale=${W}:${H},format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { timeout: 30000, maxBuffer: 1024 * 1024, encoding: "buffer" as BufferEncoding }
  );
  const buf = r.stdout as unknown as Buffer;
  if (buf.length < W * H) return null;
  return buf.subarray(0, W * H);
}

function rowStddev(pgm: Buffer, W: number, y: number): number {
  let sum = 0;
  const off = y * W;
  for (let x = 0; x < W; x++) sum += pgm[off + x];
  const mean = sum / W;
  let v = 0;
  for (let x = 0; x < W; x++) {
    const d = pgm[off + x] - mean;
    v += d * d;
  }
  return Math.sqrt(v / W);
}

export function logBand(sourcePath: string, band: SubtitleBand | null): void {
  if (band) logger.info({ band: `${(band.top * 100).toFixed(0)}%–${(band.bottom * 100).toFixed(0)}` }, `subtitle band detected`);
  else logger.info({}, "no subtitle band detected — drawing subs without masking");
}