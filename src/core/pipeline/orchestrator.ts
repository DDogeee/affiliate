import { Queue, Worker, QueueEvents, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import crypto from 'crypto';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });

export type JobStage = 'crawl' | 'process' | 'match' | 'publish';
export type JobData = { sourceId?: string; topic?: string; videoPath?: string; productIds?: string[]; platform?: string; };

export function jobId(sourceId: string, stage: JobStage, configVersion = 'v1'): string {
  return crypto.createHash('sha256').update(`${sourceId}:${stage}:${configVersion}`).digest('hex').slice(0, 24);
}

const defaultOpts: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

export const queues = {
  crawl: new Queue<JobData>('crawl', { connection }),
  process: new Queue<JobData>('process', { connection }),
  match: new Queue<JobData>('match', { connection }),
  publish: new Queue<JobData>('publish', { connection }),
};

export const queueEvents = {
  crawl: new QueueEvents('crawl', { connection }),
  process: new QueueEvents('process', { connection }),
  match: new QueueEvents('match', { connection }),
  publish: new QueueEvents('publish', { connection }),
};

export async function enqueue(stage: JobStage, data: JobData, opts?: JobsOptions) {
  const id = data.sourceId ? jobId(data.sourceId, stage) : undefined;
  return queues[stage].add(stage, data, { ...defaultOpts, ...opts, jobId: id });
}

export function createWorker(stage: JobStage, processor: (data: JobData) => Promise<void>) {
  return new Worker<JobData>(stage, async job => processor(job.data), {
    connection,
    concurrency: stage === 'process' ? 2 : 5,
    limiter: stage === 'publish' ? { max: 5, duration: 60000 } : undefined,
  });
}

// dead-letter helper
export async function quarantine(stage: JobStage, jobIdStr: string, reason: string) {
  console.error(`[quarantine] ${stage} ${jobIdStr} reason=${reason}`);
  // persist to DB via API layer; queue job is already in failed
}
