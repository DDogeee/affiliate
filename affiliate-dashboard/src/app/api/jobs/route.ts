import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { weiboUrlSchema } from "@/lib/validators";
import { ensureStorageDirs } from "@/lib/storage";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  const jobs = await prisma.job.findMany({
    where: state ? { state } : undefined,
    orderBy: { createdAt: "desc" },
  });
  // camelCase is native from Prisma; ensure ISO dates are strings (NextResponse does)
  return NextResponse.json({ data: jobs });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  // Support both sourceUrl and url keys for flexibility
  const raw = body.sourceUrl ?? body.url ?? "";
  const parsed = weiboUrlSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_URL", message: parsed.error.errors[0]?.message ?? "Invalid Weibo URL", retryable: false } },
      { status: 400 }
    );
  }
  ensureStorageDirs();
  const job = await prisma.job.create({
    data: {
      sourceUrl: parsed.data,
      state: "queued",
      publishStatus: {},
    },
  });
  return NextResponse.json({ data: job }, { status: 201 });
}
