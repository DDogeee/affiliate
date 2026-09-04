import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WeiboSourceAdapter } from "@/adapters/source/WeiboSourceAdapter";
import { getSourcePath, ensureStorageDirs } from "@/lib/storage";
import { jobLogger } from "@/lib/logger";
import fs from "fs";

async function handleFetch(id: string) {
  const start = Date.now();
  const log = jobLogger(id, "fetch");
  log.info({ jobId: id, stage: "fetch" }, "fetch request start");

  const workerUrl = process.env.WORKER_URL;
  if (workerUrl) {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/jobs/${id}/fetch`, {
        method: "POST",
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json().catch(() => {});
      log.info({ jobId: id, stage: "fetch", durationMs: Date.now() - start, proxied: true, status: res.status }, "fetch proxied to worker");
      return NextResponse.json(data, { status: res.status });
    } catch (e: any) {
      log.warn({ jobId: id, stage: "fetch", err: String(e.message) }, "worker proxy failed, checking state before fallback");
      const fresh = await prisma.job.findUnique({ where: { id } });
      if (fresh && fresh.state !== "queued" && fresh.state !== "failed") {
        // worker may have completed the stage before the response was lost — do not re-run
        return NextResponse.json({ data: fresh });
      }
    }
  }

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    log.warn({ jobId: id, stage: "fetch", durationMs: Date.now() - start }, "job not found");
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job not found", retryable: false } }, { status: 404 });
  }
  if (job.state !== "queued" && job.state !== "failed") {
    log.warn({ jobId: id, stage: "fetch", state: job.state, durationMs: Date.now() - start }, "invalid state for fetch");
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `Job state ${job.state} cannot fetch`, retryable: false } }, { status: 400 });
  }
  try {
    ensureStorageDirs();
    const adapter = new WeiboSourceAdapter();
    const result = await adapter.fetch(job.sourceUrl, id);
    const dest = getSourcePath(job.id);
    if (result.videoPath.startsWith("http")) {
      log.info({ jobId: id, stage: "fetch", url: result.videoPath.slice(0, 80) }, "downloading video");
      await adapter.downloadVideo(result.videoPath, dest);
    } else {
      if (fs.existsSync(result.videoPath)) fs.copyFileSync(result.videoPath, dest);
    }
    const updated = await prisma.job.update({
      where: { id },
      data: {
        state: "fetched",
        sourceMeta: { title: result.meta.title, thumbnail: result.meta.thumbnail, ownerHandle: result.meta.ownerHandle, comments: result.comments },
      },
    });
    log.info({ jobId: id, stage: "fetch", durationMs: Date.now() - start }, "fetch success");
    return NextResponse.json({ data: updated });
  } catch (err: any) {
    const code = err.code ?? "WEIBO_FETCH_BLOCKED";
    const retryable = err.retryable ?? true;
    log.warn({ jobId: id, stage: "fetch", code, retryable, durationMs: Date.now() - start, err: String(err.message) }, "fetch failed");
    const updated = await prisma.job.update({ where: { id }, data: { state: "failed" } });
    return NextResponse.json({ error: { code, message: err.message, retryable }, data: updated }, { status: code === "WEIBO_FETCH_BLOCKED" ? 429 : 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleFetch(id);
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleFetch(id);
}