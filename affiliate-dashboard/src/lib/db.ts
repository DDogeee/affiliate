import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined; pgPool: pg.Pool | undefined };

function getPool() {
  if (!globalForPrisma.pgPool) {
    const connectionString = process.env.DATABASE_URL || "postgresql://affiliate:affiliate@postgres:5432/affiliate";
    globalForPrisma.pgPool = new pg.Pool({ connectionString });
    // idle client errors must not crash api/worker
    globalForPrisma.pgPool.on("error", (e) => {
      try { console.warn(`pg pool error: ${e.message}`); } catch {}
    });
  }
  return globalForPrisma.pgPool;
}

const adapter = new PrismaPg(getPool());

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
