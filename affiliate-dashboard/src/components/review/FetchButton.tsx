"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function FetchButton({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  async function doFetch() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/fetch`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setMsg(`Error ${data.error?.code}: ${data.error?.message}`);
      else setMsg(`Fetched → ${data.data?.state}`);
      router.refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={doFetch} disabled={loading} className="min-h-[44px] border px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50 cursor-pointer hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors">
        {loading ? "Fetching..." : "Fetch Video"}
      </button>
      {msg && <span className="text-xs text-gray-700">{msg}</span>}
    </div>
  );
}
