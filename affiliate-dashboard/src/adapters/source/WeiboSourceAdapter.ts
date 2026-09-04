import type { SourceAdapter } from "./SourceAdapter";
import fs from "fs";
import path from "path";
import { getSourcePath } from "@/lib/storage";

export class WeiboSourceAdapter implements SourceAdapter {
  async fetch(url: string): Promise<{ videoPath: string; meta: { title: string; thumbnail: string; ownerHandle: string }; comments: Array<{ text: string; link?: string }> }> {
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
            return { videoPath: videoUrl, meta: { title, thumbnail, ownerHandle }, comments };
          }
        }
      }
    } catch (e) {
      // fall through to yt-dlp fallback
    }
    // Fallback to yt-dlp for anti-bot / visitor system — handles Weibo guest cookies correctly
    return this.fetchViaYtDlp(url);
    // Download video
    const jobId = path.basename(url).slice(0, 12) || Date.now().toString();
    // Caller will provide jobId via path; we return placeholder and let route handle download with jobId
    // For now return extracted info; actual download done in route with jobId context
    return {
      videoPath: videoUrl,
      meta: { title, thumbnail, ownerHandle },
      comments,
    };
  }

  private async fetchViaYtDlp(url: string): Promise<{ videoPath: string; meta: { title: string; thumbnail: string; ownerHandle: string }; comments: Array<{ text: string; link?: string }> }> {
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
      return { videoPath: videoUrl, meta: { title, thumbnail, ownerHandle }, comments };
    } catch (e: any) {
      throw Object.assign(new Error(`yt-dlp fallback failed: ${e.message}`), { code: "WEIBO_FETCH_BLOCKED", retryable: true });
    }
  }

  async downloadVideo(videoUrl: string, destPath: string): Promise<void> {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Video download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.writeFile(destPath, buf);
  }
}
