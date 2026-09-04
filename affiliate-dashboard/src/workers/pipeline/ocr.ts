export interface OcrSegment { start: number; end: number; textZh: string }
export async function extractOcr(jobId: string, sourcePath: string): Promise<OcrSegment[]> {
  // Stub: sample OCR via ffmpeg frames — POC returns on-screen text mock
  return [
    { start: 0, end: 3.5, textZh: "强力清洁" },
    { start: 3.5, end: 7.0, textZh: "家务必备" },
  ];
}
