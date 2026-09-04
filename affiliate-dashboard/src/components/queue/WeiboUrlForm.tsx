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
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste Weibo URL (weibo.com / weibo.cn)"
        className="flex-1 border rounded px-3 py-2 text-sm"
      />
      <button disabled={loading} className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50">
        {loading ? "Queuing..." : "Queue"}
      </button>
      {error && <span className="text-sm text-red-600 ml-2 self-center">{error}</span>}
    </form>
  );
}
