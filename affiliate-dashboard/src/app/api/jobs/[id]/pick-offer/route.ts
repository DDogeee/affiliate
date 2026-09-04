import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { pickedOfferId } = await request.json();
  if (pickedOfferId) {
    const updated = await prisma.job.update({ where: { id }, data: { pickedOfferId, state: "needs_review" } });
    return NextResponse.json({ data: updated });
  } else {
    const updated = await prisma.job.update({ where: { id }, data: { state: "skipped" } });
    return NextResponse.json({ data: updated });
  }
}
