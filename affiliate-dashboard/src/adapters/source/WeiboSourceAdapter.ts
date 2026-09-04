import type { SourceAdapter } from "./SourceAdapter";
import fs from "fs";
import path from "path";
import { getSourcePath } from "@/lib/storage";
import { jobLogger, logger } from "@/lib/logger";

export class WeiboSourceAdapter implements SourceAdapter {
  async fetch(url: string, jobId?: string): Promise<{ videoPath: string; meta: { title: string; thumbnail: string; ownerHandle: string }; comments: Array<{ text: string; link?: string }> }> {
    const log = jobId ? jobLogger(jobId, "fetch") : logger.child({ stage: "fetch" });
    const start = Date.now();
    try { log.info({ url, jobId }, "fetch start"); } catch {}
    // Try simple HTML fetch first
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15" },
      });
      if (res.ok) {
        const html = await res.text();
        // Detect Sina Visitor System anti-bot page
        const isVisitorPage = html.includes("Sina Visitor System") || html.includes("visitor/genvisitor");
        if (!isVisitorPage) {
          const m = html.match(/"url"\s*:\s*"(https:[^"]+\.mp4[^"]*)"/) || html.match(/https:\/\/[^"]+\.mp4/);
          const videoUrl = m ? (m[1] ?? m[0]).replace(/\\u002F/g, "/").replace(/\\\//g, "/") : null;
          if (videoUrl) {
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].trim() : "Weibo video";
            const thumbMatch = html.match(/"pic"\s*:\s*"(https:[^"]+)"/);
            const thumbnail = thumbMatch ? thumbMatch[1].replace(/\\u002F/g, "/") : "";
            const ownerMatch = html.match(/"screen_name"\s*:\s*"([^"]+)"/);
            const ownerHandle = ownerMatch ? ownerMatch[1] : "weibo_user";
            const comments: Array<{ text: string; link?: string }> = [];
            const commentRegex = /"text"\s*:\s*"([^"]{10,200})"/g;
            let c;
            while ((c = commentRegex.exec(html)) !== null && comments.length < 10) {
              const text = c[1].replace(/\\n/g, " ").replace(/\\"/g, '"');
              const linkMatch = text.match(/https?:\/\/[^\s]+/);
              comments.push({ text, link: linkMatch?.[0] });
            }
            try { log.info({ url, jobId, durationMs: Date.now() - start, via: "html" }, "fetch html parsed"); } catch {}
            return { videoPath: videoUrl, meta: { title, thumbnail, ownerHandle }, comments };
          }
        }
      }
    } catch (e) {
      try { log.debug({ url, jobId, err: String((e as any)?.message) }, "html fetch failed, falling back to yt-dlp"); } catch {}
      // fall through to yt-dlp fallback
    }
    // Fallback to yt-dlp for anti-bot / visitor system — handles Weibo guest cookies correctly
    return this.fetchViaYtDlp(url, jobId);
  }

  private async fetchViaYtDlp(url: string, jobId?: string): Promise<{ videoPath: string; meta: { title: string; thumbnail: string; ownerHandle: string }; comments: Array<{ text: string; link?: string }> }> {
    const log = jobId ? jobLogger(jobId, "fetch") : logger.child({ stage: "fetch" });
    const start = Date.now();
    // Dev mock: MOCK_WEIBO=1 returns a stub without calling yt-dlp (useful when Weibo is blocked and yt-dlp not needed for pipeline test)
    if (process.env.MOCK_WEIBO === "1" || process.env.MOCK_WEIBO === "true") {
      const stub = path.join(process.cwd(), "storage", "tmp", `mock-${Date.now()}.mp4`);
      await fs.promises.mkdir(path.dirname(stub), { recursive: true });
      if (!fs.existsSync(stub)) await fs.promises.writeFile(stub, "");
      try { log.info({ url, jobId, durationMs: Date.now() - start, mock: true }, "yt-dlp mock fetch"); } catch {}
      return { videoPath: stub, meta: { title: "Mock Weibo video", thumbnail: "", ownerHandle: "mock_user" }, comments: [{ text: "Mock comment for testing", link: "https://shopee.vn/mock" }] };
    }
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    try {
      const { stdout: jsonStr } = await execFileAsync("yt-dlp", ["--dump-json", "--no-playlist", url], { timeout: 30000 });
      const info = JSON.parse(jsonStr);
      const videoUrl: string | null = info.url ?? info.requested_formats?.[0]?.url ?? null;
      if (!videoUrl) throw new Error("yt-dlp returned no url");
      const title: string = info.title ?? "Weibo video";
      const thumbnail: string = info.thumbnail ?? "";
      const ownerHandle: string = info.uploader ?? info.uploader_id ?? "weibo_user";
      const comments: Array<{ text: string; link?: string }> = [];
      if (info.description) {
        const linkMatch = (info.description as string).match(/https?:\/\/[^\s]+/);
        if (linkMatch) comments.push({ text: info.description.slice(0, 200), link: linkMatch[0] });
      }
      try { log.info({ url, jobId, durationMs: Date.now() - start }, "yt-dlp fetch success"); } catch {}
      return { videoPath: videoUrl, meta: { title, thumbnail, ownerHandle }, comments };
    } catch (e: any) {
      const isEnoent = e.code === "ENOENT" || String(e.message).includes("ENOENT") || String(e.message).includes("not found");
      if (isEnoent) {
        try { log.warn({ jobId, code: "WEIBO_FETCH_BLOCKED", retryable: true, durationMs: Date.now() - start }, "yt-dlp not found on PATH (spawn yt-dlp ENOENT). Install with: pip install yt-dlp"); } catch {}
        throw Object.assign(
          new Error(
            `yt-dlp not found on PATH (spawn yt-dlp ENOENT). Install with: pip install yt-dlp (and winget install Gyan.FFmpeg for ffmpeg 9.0.1), ensure D:\\miniconda\\Scripts is on PATH, then restart shell and npm run dev. See README prerequisites. Original: ${e.message}`
          ),
          { code: "WEIBO_FETCH_BLOCKED", retryable: true }
        );
      }
      try { log.warn({ jobId, code: "WEIBO_FETCH_BLOCKED", retryable: true, durationMs: Date.now() - start, err: String(e.message) }, "yt-dlp fallback failed"); } catch {}
      throw Object.assign(new Error(`yt-dlp fallback failed: ${e.message}`), { code: "WEIBO_FETCH_BLOCKED", retryable: true });
    }
  }

  async downloadVideo(videoUrl: string, destPath: string): Promise<void> {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`Video download failed: ${res.status}`);
    const MAX = 300 * 1024 * 1024;
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX) throw new Error(`Video too large: ${len} bytes`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX) throw new Error(`Video too large: ${buf.byteLength} bytes`);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.writeFile(destPath, buf);
  }
}
