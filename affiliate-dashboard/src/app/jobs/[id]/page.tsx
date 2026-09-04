import { prisma } from "@/lib/db";
import Link from "next/link";
import PreviewPlayer from "@/components/review/PreviewPlayer";
import FetchButton from "@/components/review/FetchButton";
import LocalizeButton from "@/components/review/LocalizeButton";
import ReviewGates from "@/components/review/ReviewGates";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return <main className="p-6">Job not found — <Link href="/" className="underline cursor-pointer">back</Link></main>;
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <Link href="/" className="inline-flex items-center min-h-[44px] text-sm text-[var(--color-primary)] underline underline-offset-4 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded px-2 -mx-2">← Back to queue</Link>
      <div className="glass-strong rounded-2xl p-6 shadow-lg">
        <h1 className="text-xl font-bold break-all text-gray-900">{job.sourceUrl}</h1>
        <div className="text-xs mt-2"><span className="font-mono text-gray-500">id: {job.id}</span> • <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${job.state === "failed" ? "bg-red-100 text-red-800" : job.state === "needs_review" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{job.state}</span> <span className="text-gray-500">• {new Date(job.createdAt).toISOString()}</span></div>
        {job.sourceMeta && <pre className="text-xs bg-white/60 p-3 rounded-xl overflow-auto max-h-32 mt-3 border border-white/20">{JSON.stringify(job.sourceMeta, null, 2)}</pre>}
      </div>
      <div className="glass rounded-xl p-4 shadow-sm space-y-3">
        <h2 className="font-bold text-sm text-gray-900">Actions</h2>
        <FetchButton jobId={job.id} />
        <LocalizeButton jobId={job.id} state={job.state} />
        <div className="text-xs text-gray-500 break-all">Or curl: curl -X POST http://localhost:3000/api/jobs/{job.id}/fetch</div>
        <div className="text-xs text-[var(--color-primary)]">Logs: <code className="bg-white/60 px-1.5 py-0.5 rounded">docker compose logs -f | grep {job.id}</code></div>
      </div>
      {job.localizedVideoPath && (
        <div className="glass rounded-xl p-4 shadow-sm">
          <h2 className="font-bold text-sm text-gray-900">Preview</h2>
          <div className="mt-2">
            <PreviewPlayer src={`/api/files/${job.id}`} />
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Video uses preload=&quot;none&quot; for performance. Captions burned via ffmpeg 9:16 (720x1280).</p>
        </div>
      )}
      {job.state === "needs_review" && <div className="glass rounded-xl p-4 shadow-sm"><ReviewGates job={job} /></div>}
      {job.state !== "needs_review" && <div className="text-xs text-gray-600 glass rounded-xl p-3">Caption: {(job.caption as string) ?? "(auto after pick)"} • Voice: {JSON.stringify(job.voiceStyle)}</div>}
    </main>
  );
}
