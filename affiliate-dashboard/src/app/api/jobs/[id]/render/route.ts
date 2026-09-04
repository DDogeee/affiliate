import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateVoice } from "@/workers/pipeline/tts";
import { render } from "@/workers/pipeline/ffmpeg";
import { jobLogger } from "@/lib/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const start = Date.now();
  const log = jobLogger(id, "render");

  // read body once — reuse for both proxy and inline fallback
  const bodyText = await request.text().catch(() => "{}");
  let body: any = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = {}; }

  const workerUrl = process.env.WORKER_URL;
  if (workerUrl) {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/jobs/${id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyText,
        signal: AbortSignal.timeout(180000),
      });
      const data = await res.json().catch(() => {});
      log.info({ jobId: id, stage: "render", durationMs: Date.now() - start, proxied: true, status: res.status }, "render proxied");
      return NextResponse.json(data, { status: res.status });
    } catch (e: any) {
      log.warn({ jobId: id, stage: "render", err: String(e.message) }, "worker proxy failed, checking state before fallback");
      const fresh = await prisma.job.findUnique({ where: { id } });
      if (fresh && fresh.localizedVideoPath && (fresh.state === "needs_review" || fresh.state === "approved")) {
        // worker may have rendered before the response was lost — do not re-run
        return NextResponse.json({ data: fresh });
      }
    }
  }

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    log.warn({ jobId: id, stage: "render", durationMs: Date.now() - start }, "job not found");
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job not found", retryable: false } }, { status: 404 });
  }
  try {
    const translation = (job.translation as any[]) ?? [];
    const hasVoice = Array.isArray(translation) && translation.length > 0;
    let voicePath: string | undefined;
    if (hasVoice) {
      const speed = body.voiceStyle?.speed ?? (job.voiceStyle as any)?.speed ?? 1.0;
      voicePath = await generateVoice(translation, { speed });
    }
    const renderedPath = await render(id, translation, voicePath);
    const updated = await prisma.job.update({ where: { id }, data: { localizedVideoPath: renderedPath, voiceStyle: body.voiceStyle ?? job.voiceStyle, state: "needs_review" } });
    log.info({ jobId: id, stage: "render", durationMs: Date.now() - start }, "render success");
    return NextResponse.json({ data: updated });
  } catch (err: any) {
    log.error({ jobId: id, stage: "render", durationMs: Date.now() - start, err: String(err.message), stack: err.stack }, "render failed");
    return NextResponse.json({ error: { code: "RENDER_FAILED", message: err.message, retryable: true } }, { status: 500 });
  }
}