import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WeiboSourceAdapter } from "@/adapters/source/WeiboSourceAdapter";
import { getSourcePath, ensureStorageDirs } from "@/lib/storage";
import fs from "fs";

async function handleFetch(id: string) {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job not found", retryable: false } }, { status: 404 });
  if (job.state !== "queued" && job.state !== "failed") {
    return NextResponse.json({ error: { code: "INVALID_STATE", message: `Job state ${job.state} cannot fetch`, retryable: false } }, { status: 400 });
  }
  try {
    ensureStorageDirs();
    const adapter = new WeiboSourceAdapter();
    const result = await adapter.fetch(job.sourceUrl);
    const dest = getSourcePath(job.id);
    if (result.videoPath.startsWith("http")) {
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
    return NextResponse.json({ data: updated });
  } catch (err: any) {
    const code = err.code ?? "WEIBO_FETCH_BLOCKED";
    const retryable = err.retryable ?? true;
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
