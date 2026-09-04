"use client";
export default function PreviewPlayer({ src }: { src: string }) {
  return <video src={src} controls className="w-full max-w-[360px] aspect-[9/16] bg-black rounded" />;
}
