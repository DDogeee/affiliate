import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job || !job.localizedVideoPath) return new NextResponse("Not found", { status: 404 });
  const p = job.localizedVideoPath as string;
  if (!fs.existsSync(p)) return new NextResponse("File not found", { status: 404 });
  const stream = fs.createReadStream(p);
  return new NextResponse(stream as any, { headers: { "Content-Type": "video/mp4" } });
}
