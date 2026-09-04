"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { weiboUrlSchema } from "@/lib/validators";

export default function WeiboUrlForm({ onCreated }: { onCreated?: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = weiboUrlSchema.safeParse(url);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid Weibo URL");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to create job");
        return;
      }
      setUrl("");
      onCreated?.();
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-2 flex-wrap items-start">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste Weibo URL (weibo.com / weibo.cn)"
        aria-label="Weibo URL"
        className="flex-1 min-w-[200px] min-h-[44px] border border-gray-300 rounded-xl px-4 py-2 text-sm bg-white/80 backdrop-blur focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent placeholder:text-gray-400"
      />
      <button disabled={loading} className="min-h-[44px] min-w-[88px] bg-[var(--color-primary)] text-white rounded-xl px-6 py-2 text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2 transition-colors">
        {loading ? "Queuing..." : "Queue"}
      </button>
      {error && <span className="text-sm text-red-600 w-full mt-1" role="alert">{error}</span>}
    </form>
  );
}
