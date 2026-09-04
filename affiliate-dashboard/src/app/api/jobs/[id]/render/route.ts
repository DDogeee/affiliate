import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateVoice } from "@/workers/pipeline/tts";
import { render } from "@/workers/pipeline/ffmpeg";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job not found", retryable: false } }, { status: 404 });
  const translation = (job.translation as any[]) ?? [];
  const hasVoice = Array.isArray(translation) && translation.length > 0;
  let voicePath: string | undefined;
  if (hasVoice) {
    const speed = body.voiceStyle?.speed ?? (job.voiceStyle as any)?.speed ?? 1.0;
    voicePath = await generateVoice(translation, { speed });
  }
  const renderedPath = await render(id, translation, voicePath);
  const updated = await prisma.job.update({ where: { id }, data: { localizedVideoPath: renderedPath, voiceStyle: body.voiceStyle ?? job.voiceStyle, state: "needs_review" } });
  return NextResponse.json({ data: updated });
}
