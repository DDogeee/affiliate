import { transcribe } from "./asr";
import { extractHardSubs, extractOcr } from "./ocr";
import { detectSubtitleBand } from "./subbands";
import { translateSegments } from "./translate";
import { getSourcePath } from "@/lib/storage";
import { jobLogger } from "@/lib/logger";

export async function localize(jobId: string): Promise<{ transcript: any[]; translation: any[] }> {
  const log = jobLogger(jobId, "localize");
  const start = Date.now();
  try { log.info({ jobId }, "localize start"); } catch {}
  const sourcePath = getSourcePath(jobId);

  let segments: Array<{ start: number; end: number; textZh: string }> = [];

  // 1) If the video already has burned-in subtitles, OCR + translate those
  const band = await detectSubtitleBand(sourcePath).catch(() => null);
  if (band) {
    try { log.info({ jobId, band: `${(band.top * 100).toFixed(0)}%–${(band.bottom * 100).toFixed(0)}` }, "hardcoded subtitle band found — OCR-ing"); } catch {}
    const ocrSegs = await extractHardSubs(jobId, sourcePath, band.top, band.bottom);
    const totalText = ocrSegs.reduce((n, s) => n + s.textZh.trim().length, 0);
    if (ocrSegs.length >= 2 && totalText > 10) {
      segments = ocrSegs;
      try { log.info({ jobId, count: ocrSegs.length, source: "hard-sub-ocr" }, "using OCR subtitles as transcript"); } catch {}
    } else {
      try { log.warn({ jobId, count: ocrSegs.length, chars: totalText }, "OCR result unusable — falling back to ASR"); } catch {}
    }
  }

  // 2) No hardcoded subs (or OCR failed) → real ASR (Whisper) on the audio
  if (segments.length === 0) {
    const asrStart = Date.now();
    const asr = await transcribe(jobId, sourcePath);
    try { log.info({ jobId, durationMs: Date.now() - asrStart, count: asr.length }, "asr done"); } catch {}
    segments = asr;
  }

  // 3) last-resort stub OCR
  if (segments.length === 0) {
    const ocr = await extractOcr(jobId, sourcePath);
    try { log.info({ jobId, count: ocr.length, stub: true }, "stub ocr done"); } catch {}
    segments = ocr;
  }

  const transStart = Date.now();
  let translation = await translateSegments(segments);
  if (translation.length === 0) {
    try { log.warn({ jobId }, "translation empty, retrying"); } catch {}
    translation = await translateSegments(segments);
  }
  try { log.info({ jobId, durationMs: Date.now() - transStart, count: translation.length }, "translate done"); } catch {}
  try { log.info({ jobId, durationMs: Date.now() - start }, "localize done"); } catch {}
  return { transcript: segments, translation };
}