import http from "http";
import fs from "fs";
import { logger, jobLogger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { ensureStorageDirs, getSourcePath, getRenderedPath } from "@/lib/storage";
import { WeiboSourceAdapter } from "@/adapters/source/WeiboSourceAdapter";
import { localize } from "@/workers/pipeline/pipeline";
import { generateVoice } from "@/workers/pipeline/tts";
import { render } from "@/workers/pipeline/ffmpeg";

const PORT = (() => {
  const p = parseInt(process.env.WORKER_PORT || process.env.PORT || "3001", 10);
  return Number.isInteger(p) && p > 0 ? p : 3001;
})();

function sendJson(res: http.ServerResponse, status: number, obj: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function handleFetch(id: string): Promise<{ status: number; body: any }> {
  const log = jobLogger(id, "fetch");
  const start = Date.now();
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    log.warn({ jobId: id, durationMs: Date.now() - start }, "job not found");
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "Job not found", retryable: false } } };
  }
  if (job.state !== "queued" && job.state !== "failed") {
    log.warn({ jobId: id, state: job.state, durationMs: Date.now() - start }, "invalid state for fetch");
    return { status: 400, body: { error: { code: "INVALID_STATE", message: `Job state ${job.state} cannot fetch`, retryable: false } } };
  }
  try {
    ensureStorageDirs();
    const adapter = new WeiboSourceAdapter();
    const result = await adapter.fetch(job.sourceUrl, id);
    const dest = getSourcePath(id);
    if (result.videoPath.startsWith("http")) {
      log.info({ jobId: id, url: result.videoPath.slice(0, 80) }, "downloading video");
      await adapter.downloadVideo(result.videoPath, dest);
    } else if (fs.existsSync(result.videoPath)) {
      fs.copyFileSync(result.videoPath, dest);
    }
    const updated = await prisma.job.update({
      where: { id },
      data: {
        state: "fetched",
        sourceMeta: { title: result.meta.title, thumbnail: result.meta.thumbnail, ownerHandle: result.meta.ownerHandle, comments: result.comments },
      },
    });
    log.info({ jobId: id, durationMs: Date.now() - start }, "fetch success");
    return { status: 200, body: { data: updated } };
  } catch (err: any) {
    const code = err?.code ?? "WEIBO_FETCH_BLOCKED";
    const retryable = err?.retryable ?? true;
    log.warn({ jobId: id, code, retryable, durationMs: Date.now() - start, err: String(err?.message ?? err) }, "fetch failed");
    const updated = await prisma.job.update({ where: { id }, data: { state: "failed" } }).catch(() => null);
    return { status: code === "WEIBO_FETCH_BLOCKED" ? 429 : 500, body: { error: { code, message: err?.message ?? String(err), retryable }, data: updated } };
  }
}

async function handleLocalize(id: string): Promise<{ status: number; body: any }> {
  const log = jobLogger(id, "localize");
  const start = Date.now();
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    log.warn({ jobId: id, durationMs: Date.now() - start }, "job not found");
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "Job not found", retryable: false } } };
  }
  if (job.state !== "fetched" && job.state !== "processing") {
    log.warn({ jobId: id, state: job.state }, "invalid state for localize");
    return { status: 400, body: { error: { code: "INVALID_STATE", message: `Job state ${job.state} cannot localize`, retryable: false } } };
  }
  try {
    const { transcript, translation } = await localize(id);
    const updated = await prisma.job.update({
      where: { id },
      data: { transcript, translation, state: translation.length > 0 ? "processing" : "needs_review" },
    });
    log.info({ jobId: id, durationMs: Date.now() - start, count: translation.length }, "localize success");
    return { status: 200, body: { data: updated } };
  } catch (err: any) {
    log.error({ jobId: id, durationMs: Date.now() - start, err: String(err?.message ?? err) }, "localize failed");
    const updated = await prisma.job.update({ where: { id }, data: { state: "needs_review", transcript: [] } }).catch(() => null);
    return { status: 500, body: { error: { code: "TRANSLATION_FAILED", message: err?.message ?? String(err), retryable: true }, data: updated } };
  }
}

async function handleRender(id: string, body: any): Promise<{ status: number; body: any }> {
  const log = jobLogger(id, "render");
  const start = Date.now();
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    log.warn({ jobId: id, durationMs: Date.now() - start }, "job not found");
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "Job not found", retryable: false } } };
  }
  if (job.state !== "fetched" && job.state !== "processing" && job.state !== "needs_review" && job.state !== "approved") {
    log.warn({ jobId: id, state: job.state }, "invalid state for render");
    return { status: 400, body: { error: { code: "INVALID_STATE", message: `Job state ${job.state} cannot render`, retryable: false } } };
  }
  try {
    const translation = (job.translation as any[]) ?? [];
    let voicePath: string | undefined;
    if (translation.length > 0) {
      const speed = body?.voiceStyle?.speed ?? (job.voiceStyle as any)?.speed ?? 1.0;
      voicePath = await generateVoice(translation, { speed });
    }
    const renderedPath = await render(id, translation, voicePath);
    const updated = await prisma.job.update({
      where: { id },
      data: { localizedVideoPath: renderedPath, voiceStyle: body?.voiceStyle ?? job.voiceStyle, state: "needs_review" },
    });
    log.info({ jobId: id, durationMs: Date.now() - start }, "render success");
    return { status: 200, body: { data: updated } };
  } catch (err: any) {
    log.error({ jobId: id, durationMs: Date.now() - start, err: String(err?.message ?? err) }, "render failed");
    return { status: 500, body: { error: { code: "RENDER_FAILED", message: err?.message ?? String(err), retryable: true } } };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathName = url.pathname;
    if (pathName === "/health" || pathName === "/api/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }
    const m = pathName.match(/^\/(?:api\/)?jobs\/([^/]+)\/(fetch|localize|render)$/);
    if (m && req.method === "POST") {
      const id = m[1];
      const action = m[2];
      let body: any = {};
      if (action === "render") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString();
        try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      }
      const result =
        action === "fetch" ? await handleFetch(id)
        : action === "localize" ? await handleLocalize(id)
        : await handleRender(id, body);
      sendJson(res, result.status, result.body);
      return;
    }
    sendJson(res, 404, { error: "not found" });
  } catch (err: any) {
    try { logger.error({ err: String(err?.message ?? err) }, "worker request error"); } catch {}
    if (!res.headersSent) sendJson(res, 400, { error: "bad request" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  try { logger.info({ port: PORT }, `worker listening on ${PORT}`); } catch {}
});

async function shutdown() {
  try { await prisma.$disconnect(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);