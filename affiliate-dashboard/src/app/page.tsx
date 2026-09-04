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
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold">Affiliate Dashboard — Jobs</h1>
      <div className="mt-4">
        <WeiboUrlForm />
      </div>
      <div className="flex gap-2 mt-4 text-sm">
        <Link href="/" className={`px-2 py-1 rounded ${!params.state ? "bg-black text-white" : "border"}`}>All</Link>
        {STATES.map((s) => (
          <Link key={s} href={`/?state=${s}`} className={`px-2 py-1 rounded ${params.state === s ? "bg-black text-white" : "border"}`}>{s}</Link>
        ))}
      </div>
      <p className="text-sm text-gray-500 mt-2">{jobs.length} jobs {params.state ? `(${params.state})` : ""}</p>
      <ul className="mt-4 space-y-2">
        {jobs.map((j: any) => (
          <li key={j.id} className="border p-3 rounded">
            <div className="font-mono text-xs">{j.id}</div>
            <div className="break-all text-sm">{j.sourceUrl}</div>
            <div className="text-xs">state: {j.state} • {new Date(j.createdAt).toISOString()}</div>
            {j.sourceMeta && (
              <div className="text-xs text-gray-500 mt-1">owner: {(j.sourceMeta as any).ownerHandle ?? ""} • comments: {(j.sourceMeta as any).comments?.length ?? 0}</div>
            )}
            <Link href={`/jobs/${j.id}`} className="text-xs underline">detail</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
