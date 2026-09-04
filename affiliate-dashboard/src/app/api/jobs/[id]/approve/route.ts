import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job not found", retryable: false } }, { status: 404 });
  // Gate a+b+c+d is checked client-side; server just moves to approved if has offer
  if (!job.pickedOfferId) return NextResponse.json({ error: { code: "GATE_NOT_PASSED", message: "Pick Shopee Offer required", retryable: false } }, { status: 400 });
  const updated = await prisma.job.update({ where: { id }, data: { state: "approved" } });
  return NextResponse.json({ data: updated });
}
