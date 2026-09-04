import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localize } from "@/workers/pipeline/pipeline";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job not found", retryable: false } }, { status: 404 });
  try {
    const { transcript, translation } = await localize(id);
    const updated = await prisma.job.update({
      where: { id },
      data: {
        transcript,
        translation,
        state: translation.length > 0 ? "processing" : "needs_review",
      },
    });
    return NextResponse.json({ data: updated });
  } catch (err: any) {
    // Retry once already done in pipeline; mark needs_review with raw
    const updated = await prisma.job.update({ where: { id }, data: { state: "needs_review", transcript: [] } });
    return NextResponse.json({ error: { code: "TRANSLATION_FAILED", message: err.message, retryable: true }, data: updated }, { status: 500 });
  }
}
