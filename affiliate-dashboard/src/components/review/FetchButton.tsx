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
    <div className="flex items-center gap-2">
      <button onClick={doFetch} disabled={loading} className="border px-3 py-1 rounded bg-black text-white text-xs disabled:opacity-50">
        {loading ? "Fetching..." : "Fetch Video"}
      </button>
      {msg && <span className="text-xs">{msg}</span>}
    </div>
  );
}
