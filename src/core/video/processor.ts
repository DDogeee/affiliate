import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const exec = promisify(execFile);

export type ProcessInput = {
  inputVideo: string; // local path or remote URL
  outputDir: string;
  attribution?: string;
};

export type ProcessResult = {
  outputVideo: string;
  srtPath: string;
  transcriptZh: string;
  transcriptVi: string;
  confidence: number;
};

async function downloadVideo(url: string, dest: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`download failed ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    if (ct && !ct.startsWith('video') && !ct.startsWith('application/octet-stream')) {
      // allow but warn — some CDNs mislabel
      console.warn(`[download] unexpected content-type ${ct} for ${url}`);
    }
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > 500 * 1024 * 1024) throw new Error(`video too large ${len}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
  } finally {
    clearTimeout(timeout);
  }
}

async function extractAudio(video: string, audioOut: string) {
  await exec('ffmpeg', ['-y', '-i', video, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', audioOut]);
}

// Placeholder STT: call Whisper API if configured, else mock
async function transcribeZh(audioPath: string): Promise<{ text: string; confidence: number }> {
  if (process.env.OPENAI_API_KEY) {
    // real call omitted for brevity; return mock shape
    return { text: '示例中文转录', confidence: 0.82 };
  }
  // mock Chinese transcript
  return { text: '这是一款非常实用的家居收纳产品', confidence: 0.78 };
}

async function translateZhToVi(text: string): Promise<string> {
  if (!text) return '';
  if (process.env.TRANSLATE_API_URL) {
    return text; // stub for external translation
  }
  const dict: Record<string, string> = {
    '这是一款非常实用的家居收纳产品': 'Đây là một sản phẩm lưu trữ gia dụng rất thiết thực',
    '示例中文转录': 'Bản ghi mẫu tiếng Trung',
  };
  return dict[text] ?? `[VI] ${text}`;
}

async function ttsVi(text: string, outPath: string): Promise<void> {
  // Prefer edge-tts via python if available, else generate silent placeholder
  try {
    await exec('edge-tts', ['--voice', 'vi-VN-NamMinhNeural', '--text', text, '--write-media', outPath]);
  } catch {
    // fallback: 2s silent wav via ffmpeg
    await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '2', '-q:a', '9', '-acodec', 'libmp3lame', outPath]);
  }
}

async function writeSrt(textVi: string, srtPath: string) {
  const content = `1\n00:00:00,000 --> 00:00:04,000\n${textVi}\n`;
  await fs.writeFile(srtPath, content, 'utf-8');
}

export async function processVideo(input: ProcessInput): Promise<ProcessResult> {
  await fs.mkdir(input.outputDir, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vid-'));
  const localVideo = path.join(tmpDir, 'input.mp4');
  const audioPath = path.join(tmpDir, 'audio.wav');
  const viAudio = path.join(input.outputDir, 'vi_audio.mp3');
  const srtPath = path.join(input.outputDir, 'subs.srt');
  const outputVideo = path.join(input.outputDir, 'output.mp4');

  const isUrl = input.inputVideo.startsWith('http');
  if (isUrl) await downloadVideo(input.inputVideo, localVideo);
  else await fs.copyFile(input.inputVideo, localVideo);

  await extractAudio(localVideo, audioPath);
  const { text: zh, confidence } = await transcribeZh(audioPath);
  const vi = await translateZhToVi(zh);
  await ttsVi(vi, viAudio);
  await writeSrt(vi, srtPath);

  // FFmpeg mux: original video + vi audio (duck original 20%) + burned subs if available
  const hasViAudio = await fs.stat(viAudio).then(()=>true).catch(()=>false);
  if (hasViAudio) {
    await exec('ffmpeg', [
      '-y', '-i', localVideo, '-i', viAudio,
      '-filter_complex', '[0:a]volume=0.2[a0];[a0][1:a]amix=inputs=2:duration=longest[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-shortest',
      outputVideo
    ]).catch(async () => {
      // fallback without amix
      await exec('ffmpeg', ['-y', '-i', localVideo, '-i', viAudio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-shortest', outputVideo]);
    });
    // burn subs
    const withSubs = outputVideo.replace('.mp4', '.subs.mp4');
    try {
      await exec('ffmpeg', ['-y', '-i', outputVideo, '-vf', `subtitles=${srtPath}`, '-c:a', 'copy', withSubs]);
      await fs.rename(withSubs, outputVideo);
    } catch { /* subs optional */ }
  } else {
    await fs.copyFile(localVideo, outputVideo);
  }

  return { outputVideo, srtPath, transcriptZh: zh, transcriptVi: vi, confidence };
}
