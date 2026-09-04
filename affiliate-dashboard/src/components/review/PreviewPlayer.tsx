"use client";
import { useState } from "react";

export default function PreviewPlayer({ src }: { src: string }) {
  const [err, setErr] = useState<string | null>(null);
  if (err) {
    return (
      <div className="w-full max-w-[360px] aspect-[9/16] bg-black rounded-xl flex items-center justify-center p-4">
        <div className="text-xs text-white text-center">
          Preview not playable — stub video (0 bytes). Run with real ffmpeg 9.0.1 + yt-dlp, then re-render. <br />
          <span className="text-gray-400">{err}</span>
        </div>
      </div>
    );
  }
  return (
    <video
      src={src}
      controls
      preload="none"
      playsInline
      className="w-full max-w-[360px] aspect-[9/16] bg-black rounded-xl"
      onError={() => setErr("The fetching process for the media resource was aborted — empty/invalid mp4")}
    >
      Your browser does not support video.
    </video>
  );
}
