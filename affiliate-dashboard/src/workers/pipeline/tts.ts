import { logger } from "@/lib/logger";
export async function generateVoice(segments: Array<{ start: number; end: number; textVi: string }>, voiceStyle: { speed?: number }): Promise<string> {
  const start = Date.now();
  try { logger.info({ stage: "tts", count: segments.length }, "tts start"); } catch {}
  // Stub: returns tmp wav path; real would call Edge/FPT.AI TTS with SSML rate
  const speed = voiceStyle?.speed ?? 1.0;
  // Simulate time-aligned generation <60s
  const p = `/tmp/voice_${Date.now()}_${speed}.wav`;
  try { logger.info({ stage: "tts", durationMs: Date.now() - start }, "tts done"); } catch {}
  return p;
}
