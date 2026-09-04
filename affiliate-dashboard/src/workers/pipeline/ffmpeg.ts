import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export async function render(jobId: string, segments: Array<{ start: number; end: number; textVi: string }>, voicePath?: string): Promise<string> {
  const renderedPath = path.join(process.cwd(), "storage", "rendered", `${jobId}.mp4`);
  // Build SRT
  const srt = segments.map((s,i) => `${i+1}\n${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n${s.textVi}\n`).join("\n");
  const srtPath = path.join(process.cwd(), "storage", "tmp", `${jobId}.srt`);
  await fs.promises.mkdir(path.dirname(srtPath), { recursive: true });
  await fs.promises.writeFile(srtPath, srt, "utf-8");
  // Stub ffmpeg command — in real, exec ffmpeg
  // For POC, just touch file to simulate 9:16 output
  await fs.promises.mkdir(path.dirname(renderedPath), { recursive: true });
  // Simulate ffmpeg burn: create empty file if not exists
  if (!fs.existsSync(renderedPath)) await fs.promises.writeFile(renderedPath, "");
  return renderedPath;
}
function toSrtTime(sec: number) {
  const h = Math.floor(sec/3600); const m = Math.floor((sec%3600)/60); const s = Math.floor(sec%60); const ms = Math.floor((sec%1)*1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
}
