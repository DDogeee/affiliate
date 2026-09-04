export interface Segment { start: number; end: number; textZh: string }
export async function transcribe(jobId: string, sourcePath: string): Promise<Segment[]> {
  // Stub: in POC, return mock segments; real impl would call Whisper/FPT.AI
  // Detect silence via file size
  const fs = await import("fs");
  if (!fs.existsSync(sourcePath)) return [];
  // Mock 2 segments
  return [
    { start: 0, end: 3.5, textZh: "大家好，看看这个清洁工具" },
    { start: 3.5, end: 7.0, textZh: "非常实用，轻松清洁" },
  ];
}
