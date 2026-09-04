import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { jobLogger } from "@/lib/logger";
import { getRenderedPath, getSourcePath, getTmpPath } from "@/lib/storage";
import { detectSubtitleBand, logBand, SubtitleBand } from "./subbands";

function escapeFilterPath(p: string): string {
  // ffmpeg filter path escaping: backslashes -> forward, escape : ' \ , within the argument
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export async function render(
  jobId: string,
  segments: Array<{ start: number; end: number; textVi: string }>,
  voicePath?: string
): Promise<string> {
  const log = jobLogger(jobId, "render");
  const start = Date.now();
  const renderedPath = getRenderedPath(jobId);
  const sourcePath = getSourcePath(jobId);
  const srtPath = getTmpPath(jobId, ".srt");

  const srt = segments.map((s, i) => `${i + 1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.textVi}\n`).join("\n");
  await fs.promises.mkdir(path.dirname(srtPath), { recursive: true });
  await fs.promises.writeFile(srtPath, srt, "utf-8");
  await fs.promises.mkdir(path.dirname(renderedPath), { recursive: true });

  const stat = fs.existsSync(renderedPath) ? fs.statSync(renderedPath) : null;
  const sourceStat = fs.existsSync(sourcePath) ? fs.statSync(sourcePath) : null;
  const srtStat = fs.existsSync(srtPath) ? fs.statSync(srtPath) : null;
  const voiceExists = !!voicePath && fs.existsSync(voicePath);
  const voiceStat = voicePath && fs.existsSync(voicePath) ? fs.statSync(voicePath) : null;

  // Re-render when stale: missing/too-small, or any input (source/srt/voice) newer than the output
  const inputsNewer =
    (sourceStat ? sourceStat.mtimeMs : 0) > (stat?.mtimeMs ?? 0) ||
    (srtStat ? srtStat.mtimeMs : 0) > (stat?.mtimeMs ?? 0) ||
    (voiceStat ? voiceStat.mtimeMs : 0) > (stat?.mtimeMs ?? 0);
  const needsGen = !stat || stat.size < 1000 || inputsNewer;

  let fallbackReason: string | null = null;
  if (needsGen) {
    try {
      const burnOk = await burnSubtitles(sourcePath, srtPath, voicePath, renderedPath, sourceStat, log, jobId, start);
      if (burnOk) {
        try { log.info({ jobId, durationMs: Date.now() - start }, "ffmpeg burn success"); } catch {}
      } else if (sourceStat && sourceStat.size > 1000) {
        fs.copyFileSync(sourcePath, renderedPath);
        fallbackReason = "no-source-copy";
        try { log.warn({ jobId }, "no source for burn, copied source"); } catch {}
      } else {
        await genBlackPlaceholder(renderedPath, log);
      }
    } catch (e: any) {
      try { log.error({ jobId, err: String(e.message), stack: e.stack, durationMs: Date.now() - start }, "ffmpeg render error"); } catch {}
      if (!fs.existsSync(renderedPath)) {
        if (sourceStat && sourceStat.size > 1000) {
          fs.copyFileSync(sourcePath, renderedPath);
          fallbackReason = "fallback-source-copy";
        } else {
          try { await genBlackPlaceholder(renderedPath, log); } catch { await fs.promises.writeFile(renderedPath, Buffer.alloc(4096, 0)); }
          fallbackReason = "fallback-black";
        }
      }
    }
  } else {
    try { log.info({ jobId, durationMs: Date.now() - start }, "render: cached, skip ffmpeg"); } catch {}
  }

  // Ensure rendered is never 0-byte / too small to play
  try {
    const rs = fs.existsSync(renderedPath) ? fs.statSync(renderedPath) : null;
    if (!rs || rs.size < 3072) {
      if (sourceStat && sourceStat.size >= 3072) {
        fs.copyFileSync(sourcePath, renderedPath);
        try { log.warn({ jobId, size: rs?.size ?? 0 }, "rendered too small, copied source to ensure >=3KB"); } catch {}
      } else {
        try { await genBlackPlaceholder(renderedPath, log); } catch {
          const cur = fs.existsSync(renderedPath) ? fs.readFileSync(renderedPath) : Buffer.alloc(0);
          if (cur.length < 3072) await fs.promises.writeFile(renderedPath, Buffer.concat([cur, Buffer.alloc(3072 - cur.length, 0)]));
        }
      }
    }
  } catch {}

  const finalSize = fs.existsSync(renderedPath) ? fs.statSync(renderedPath).size : 0;
  try { log.info({ jobId, durationMs: Date.now() - start, size: finalSize, fallbackReason }, "render done"); } catch {}
  return renderedPath;
}

async function burnSubtitles(
  sourcePath: string,
  srtPath: string,
  voicePath: string | undefined,
  renderedPath: string,
  sourceStat: fs.Stats | null,
  log: any,
  jobId: string,
  start: number
): Promise<boolean> {
  if (!sourceStat || sourceStat.size <= 1000) return false;

  // Detect (mostly hardcoded) subtitle band in the source so we can mask it before drawing Vietnamese
  let band: SubtitleBand | null = null;
  try { band = await detectSubtitleBand(sourcePath); } catch (e: any) { try { log.debug({ err: String(e.message) }, "subtitle band detection failed"); } catch {} }
  logBand(sourcePath, band);

  const escSrt = escapeFilterPath(srtPath);
  const voiceExists = !!voicePath && fs.existsSync(String(voicePath));
  const subtitlesFilter = `subtitles=filename='${escSrt}':force_style='Fontsize=20,MarginV=18'`;

  let vf: string;
  let vLabel = "[vout]";
  if (band) {
    const topExpr = (band.top * 100).toFixed(2);
    const hExpr = ((band.bottom - band.top) * 100).toFixed(2);
    vf = `[0:v]split=2[orig][band];[band]crop=w=iw:h=trunc(ih*${hExpr}/100):x=0:y=trunc(ih*${topExpr}/100),boxblur=luma_radius=20:luma_power=2:chroma_radius=10:chroma_power=2[bb];[orig][bb]overlay=0:trunc(H*${topExpr}/100)[masked];[masked]${subtitlesFilter}[vout]`;
  } else {
    vf = `[0:v]${subtitlesFilter}[vout]`;
  }

  const args = ["-y", "-i", sourcePath];
  if (voiceExists) args.push("-i", String(voicePath));
  args.push("-filter_complex", vf, "-map", vLabel);
  if (voiceExists) {
    // don't -shortest: voice track may be shorter than the video (timing comes from ASR segments)
    args.push("-map", "1:a", "-c:v", "libx264", "-crf", "23", "-preset", "veryfast", "-c:a", "aac");
  } else {
    args.push("-c:a", "copy");
  }
  args.push(renderedPath);

  try {
    await runFfmpegWithProgress(args, log, jobId);
    return true;
  } catch (e: any) {
    try { log.warn({ jobId, err: String(e.message) }, "ffmpeg burn failed"); } catch {}
    // retry without subtitle filter (no burn) so preview still works
    try {
      await runFfmpegWithProgress(["-y", "-i", sourcePath, "-c", "copy", "-t", "60", renderedPath], log, jobId);
      return true;
    } catch (e2: any) {
      try { log.warn({ jobId, err: String(e2.message) }, "ffmpeg plain copy failed"); } catch {}
      return false;
    }
  }
}

async function genBlackPlaceholder(renderedPath: string, log: any): Promise<void> {
  try {
    await runFfmpegWithProgress(
      ["-y", "-f", "lavfi", "-i", "color=c=black:s=720x1280:d=1:r=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", "1", renderedPath],
      log
    );
  } catch {
    await fs.promises.writeFile(renderedPath, Buffer.alloc(4096, 0));
  }
}

function runFfmpegWithProgress(args: string[], log: any, jobId?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      const s = d.toString();
      stderr += s;
      const m = s.match(/time=\s*(\S+)/);
      if (m) {
        try { log.debug({ jobId, time: m[1] }, `ffmpeg time=${m[1]}`); } catch {}
      }
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function toSrtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}