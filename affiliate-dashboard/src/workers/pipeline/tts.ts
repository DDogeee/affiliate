export async function generateVoice(segments: Array<{ start: number; end: number; textVi: string }>, voiceStyle: { speed?: number }): Promise<string> {
  // Stub: returns tmp wav path; real would call Edge/FPT.AI TTS with SSML rate
  const speed = voiceStyle?.speed ?? 1.0;
  // Simulate time-aligned generation <60s
  return `/tmp/voice_${Date.now()}_${speed}.wav`;
}
