import pino from "pino";

export const logger = pino({
  level: (process.env.LOG_LEVEL || "info").trim().toLowerCase() || "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
});

export function jobLogger(jobId: string, stage: string) {
  try {
    return logger.child({ jobId, stage });
  } catch {
    return logger;
  }
}

export function safeLog(fn: () => void) {
  try {
    fn();
  } catch {
    // logger must never throw
  }
}
