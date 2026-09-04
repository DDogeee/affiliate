import { prisma } from "./db";
export async function queueForPublish(jobId: string) {
  return prisma.job.update({ where: { id: jobId }, data: { state: "publishing", publishStatus: { facebook: { status: "pending", updatedAt: new Date().toISOString() }, tiktok: { status: "pending", updatedAt: new Date().toISOString() } } } });
}
