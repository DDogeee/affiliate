import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FacebookDestinationAdapter } from "@/adapters/destination/FacebookDestinationAdapter";
import { TikTokDestinationAdapter } from "@/adapters/destination/TikTokDestinationAdapter";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job not found", retryable: false } }, { status: 404 });
  const publishStatus: any = job.publishStatus ?? {};
  try {
    const caption = (job.caption as string) ?? "";
    const link = (job as any).pickedOfferId ? `https://shopee.vn/product/${(job as any).pickedOfferId}` : "";
    // Try Facebook
    try {
      const fb = new FacebookDestinationAdapter();
      const r = await fb.publish((job.localizedVideoPath as string) ?? "", caption, link);
      publishStatus.facebook = { status: "published", postUrl: r.postUrl, updatedAt: new Date().toISOString() };
    } catch (e: any) {
      publishStatus.facebook = { status: "failed", error: e.message, code: e.code, updatedAt: new Date().toISOString() };
    }
    // Try TikTok
    try {
      const tt = new TikTokDestinationAdapter();
      const r = await tt.publish((job.localizedVideoPath as string) ?? "", caption, link);
      publishStatus.tiktok = { status: "published", postUrl: r.postUrl, updatedAt: new Date().toISOString() };
    } catch (e: any) {
      publishStatus.tiktok = { status: "failed", error: e.message, code: e.code, updatedAt: new Date().toISOString() };
    }
    const hasPublished = Object.values(publishStatus).some((v: any) => v.status === "published");
    const updated = await prisma.job.update({ where: { id }, data: { publishStatus, state: hasPublished ? "published" : "publishing" } });
    return NextResponse.json({ data: updated });
  } catch (err: any) {
    return NextResponse.json({ error: { code: err.code ?? "PUBLISH_FAILED", message: err.message, retryable: true } }, { status: 500 });
  }
}
