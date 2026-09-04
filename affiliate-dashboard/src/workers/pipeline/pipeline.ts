import { transcribe } from "./asr";
import { extractOcr } from "./ocr";
import { translateSegments } from "./translate";
import { getSourcePath } from "@/lib/storage";

export async function localize(jobId: string): Promise<{ transcript: any[]; translation: any[] }> {
  const sourcePath = getSourcePath(jobId);
  const asr = await transcribe(jobId, sourcePath);
  const ocr = await extractOcr(jobId, sourcePath);
  // Merge ASR + OCR, prefer ASR if non-empty, else OCR
  const segments = asr.length > 0 ? asr : ocr;
  let translation = await translateSegments(segments);
  // Retry once on empty translation simulation
  if (translation.length === 0) {
    translation = await translateSegments(segments);
  }
  return { transcript: segments, translation };
}
