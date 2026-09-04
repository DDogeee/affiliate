"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { label: "Transcribing", pct: 25 },
  { label: "Translating", pct: 50 },
  { label: "Generating voice", pct: 75 },
  { label: "Burning subtitles", pct: 95 },
] as const;

export default function LocalizeButton({ jobId, state }: { jobId: string; state: string }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  if (state !== "fetched" && state !== "processing") return null;

  async function doLocalize() {
    setLoading(true);
    setMsg(null);
    setStep(0);
    setPct(5);
    const tick = (i: number) => { setStep(i); setPct(STEPS[i].pct); };
    try {
      tick(0);
      const r1 = await fetch(`/api/jobs/${jobId}/localize`, { method: "POST" });
      tick(1);
      const d1 = await r1.json();
      if (!r1.ok) {
        setMsg(`Localize failed ${d1.error?.code}: ${d1.error?.message}`);
        router.refresh();
        return;
      }
      tick(2);
      // small delay so progress is visible (stub is instant)
      await new Promise((r) => setTimeout(r, 400));
      tick(3);
      const r2 = await fetch(`/api/jobs/${jobId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceStyle: d1.data?.voiceStyle ?? { speed: 1 } }),
      });
      setPct(100);
      const d2 = await r2.json();
      if (!r2.ok) setMsg(`Render failed ${d2.error?.code}: ${d2.error?.message}`);
      else setMsg(`Ready → ${d2.data?.state}`);
      router.refresh();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
      setTimeout(() => { setPct(0); setStep(0); }, 1200);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={doLocalize}
          disabled={loading}
          className="min-h-[44px] border border-[var(--color-primary)] px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50 hover:bg-blue-700 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2 transition-colors"
        >
          {loading ? `${STEPS[step].label}… ${pct}%` : "Localize → Needs Review"}
        </button>
        {msg && <span className="text-xs text-gray-700">{msg}</span>}
      </div>
      {loading && (
        <div className="w-full max-w-xs">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-2 bg-[var(--color-primary)] rounded-full transition-all duration-400" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[10px] text-gray-600 mt-1">{STEPS[step].label} — {pct}%</div>
        </div>
      )}
      <div className="text-[10px] text-gray-500">Real ffmpeg progress streams as <code>ffmpeg time=</code> debug logs; stub simulates 4 steps. Tail logs: <code>docker compose logs -f worker | grep {jobId}</code></div>
    </div>
  );
}
