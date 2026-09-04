import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { localize } from "@/workers/pipeline/pipeline";
import { jobLogger } from "@/lib/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const start = Date.now();
  const log = jobLogger(id, "localize");

  const workerUrl = process.env.WORKER_URL;
  if (workerUrl) {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/jobs/${id}/localize`, {
        method: "POST",
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json().catch(() => {});
      log.info({ jobId: id, stage: "localize", durationMs: Date.now() - start, proxied: true, status: res.status }, "localize proxied");
      return NextResponse.json(data, { status: res.status });
    } catch (e: any) {
      log.warn({ jobId: id, stage: "localize", err: String(e.message) }, "worker proxy failed, checking state before fallback");
      const fresh = await prisma.job.findUnique({ where: { id } });
      if (fresh && fresh.state !== "fetched" && fresh.state !== "queued" && fresh.state !== "failed") {
        // worker may have completed the stage before the response was lost — do not re-run
        return NextResponse.json({ data: fresh });
      }
    }
  }

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    log.warn({ jobId: id, stage: "localize", durationMs: Date.now() - start }, "job not found");
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job not found", retryable: false } }, { status: 404 });
  }
  try {
    const { transcript, translation } = await localize(id);
    const updated = await prisma.job.update({
      where: { id },
      data: { transcript, translation, state: translation.length > 0 ? "processing" : "needs_review" },
    });
    log.info({ jobId: id, stage: "localize", durationMs: Date.now() - start, count: translation.length }, "localize success");
    return NextResponse.json({ data: updated });
  } catch (err: any) {
    log.error({ jobId: id, stage: "localize", durationMs: Date.now() - start, err: String(err.message), stack: err.stack }, "localize failed");
    const updated = await prisma.job.update({ where: { id }, data: { state: "needs_review", transcript: [] } });
    return NextResponse.json({ error: { code: "TRANSLATION_FAILED", message: err.message, retryable: true }, data: updated }, { status: 500 });
  }
}