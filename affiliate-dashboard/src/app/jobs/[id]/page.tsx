import { prisma } from "@/lib/db";
import Link from "next/link";
import PreviewPlayer from "@/components/review/PreviewPlayer";
import FetchButton from "@/components/review/FetchButton";
import ReviewGates from "@/components/review/ReviewGates";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return <main className="p-6">Job not found — <Link href="/" className="underline">back</Link></main>;
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <Link href="/" className="text-sm underline">← Back to queue</Link>
      <h1 className="text-xl font-bold break-all">{job.sourceUrl}</h1>
      <div className="text-xs">id: {job.id} • state: <b>{job.state}</b> • {new Date(job.createdAt).toISOString()}</div>
      {job.sourceMeta && <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">{JSON.stringify(job.sourceMeta, null, 2)}</pre>}
      <div className="border p-3 rounded space-y-2">
        <h2 className="font-bold text-sm">Actions</h2>
        <FetchButton jobId={job.id} />
        <div className="text-xs text-gray-500">Or curl: curl -X POST http://localhost:3000/api/jobs/{job.id}/fetch</div>
      </div>
      {job.localizedVideoPath && (
        <div className="border p-3 rounded">
          <h2 className="font-bold text-sm">Preview</h2>
          <PreviewPlayer src={`/api/files/${job.id}`} />
        </div>
      )}
      {job.state === "needs_review" && <ReviewGates job={job} />}
      {job.state !== "needs_review" && <div className="text-xs text-gray-500">Caption: {(job.caption as string) ?? "(auto after pick)"} • Voice: {JSON.stringify(job.voiceStyle)}</div>}
    </main>
  );
}
