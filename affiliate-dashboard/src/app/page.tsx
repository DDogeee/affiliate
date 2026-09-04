import { prisma } from "@/lib/db";
import WeiboUrlForm from "@/components/queue/WeiboUrlForm";
import Link from "next/link";

const STATES = ["queued", "fetched", "failed", "skipped", "published"] as const;

export default async function Home({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const params = await searchParams;
  const jobs = await prisma.job.findMany({
    where: params.state ? { state: params.state } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen">
      <div className="glass-strong rounded-2xl p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-gray-900">Affiliate Dashboard — Jobs</h1>
        <p className="text-sm text-gray-600 mt-1">Weibo → Vietnamese Reels pipeline</p>
        <div className="mt-4">
          <WeiboUrlForm />
        </div>
      </div>
      <div className="flex gap-2 mt-6 text-sm flex-wrap">
        <Link href="/" className={`min-h-[44px] px-4 py-2 rounded-full flex items-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors ${!params.state ? "bg-[var(--color-primary)] text-white shadow" : "glass hover:bg-white/80"}`}>All</Link>
        {STATES.map((s) => (
          <Link key={s} href={`/?state=${s}`} className={`min-h-[44px] px-4 py-2 rounded-full flex items-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-colors ${params.state === s ? "bg-[var(--color-primary)] text-white shadow" : "glass hover:bg-white/80"}`}>{s}</Link>
        ))}
      </div>
      <p className="text-sm text-gray-500 mt-3">{jobs.length} jobs {params.state ? `(${params.state})` : ""}</p>
      <ul className="mt-4 space-y-3">
        {jobs.map((j: any) => (
          <li key={j.id} className="glass rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="font-mono text-xs text-gray-500">{j.id}</div>
            <div className="break-all text-sm font-medium text-gray-900 mt-1">{j.sourceUrl}</div>
            <div className="text-xs mt-1"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${j.state === "failed" ? "bg-red-100 text-red-800" : j.state === "needs_review" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>{j.state}</span> <span className="text-gray-500">• {new Date(j.createdAt).toISOString()}</span></div>
            {j.sourceMeta && (
              <div className="text-xs text-gray-600 mt-1">owner: {(j.sourceMeta as any).ownerHandle ?? ""} • comments: {(j.sourceMeta as any).comments?.length ?? 0}</div>
            )}
            <Link href={`/jobs/${j.id}`} className="inline-flex items-center justify-center min-h-[44px] mt-2 text-xs font-medium text-[var(--color-primary)] underline underline-offset-4 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded px-2 -mx-2">detail →</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
