import { transcribe } from "./asr";
import { extractOcr } from "./ocr";
import { translateSegments } from "./translate";
import { getSourcePath } from "@/lib/storage";
import { jobLogger } from "@/lib/logger";

export async function localize(jobId: string): Promise<{ transcript: any[]; translation: any[] }> {
  const log = jobLogger(jobId, "localize");
  const start = Date.now();
  try { log.info({ jobId }, "localize start"); } catch {}
  const sourcePath = getSourcePath(jobId);
  const asrStart = Date.now();
  const asr = await transcribe(jobId, sourcePath);
  try { log.info({ jobId, durationMs: Date.now() - asrStart, count: asr.length }, "asr done"); } catch {}
  const ocrStart = Date.now();
  const ocr = await extractOcr(jobId, sourcePath);
  try { log.info({ jobId, durationMs: Date.now() - ocrStart, count: ocr.length }, "ocr done"); } catch {}
  // Merge ASR + OCR, prefer ASR if non-empty, else OCR
  const segments = asr.length > 0 ? asr : ocr;
  const transStart = Date.now();
  let translation = await translateSegments(segments);
  // Retry once on empty translation simulation
  if (translation.length === 0) {
    try { log.warn({ jobId }, "translation empty, retrying"); } catch {}
    translation = await translateSegments(segments);
  }
  try { log.info({ jobId, durationMs: Date.now() - transStart, count: translation.length }, "translate done"); } catch {}
  try { log.info({ jobId, durationMs: Date.now() - start }, "localize done"); } catch {}
  return { transcript: segments, translation };
}
