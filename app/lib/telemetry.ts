import pino from 'pino';

export interface TelemetryContext {
  traceId?: string;
  jobId?: string;
  requestId?: string;
  source?: string;
}

export interface TelemetryLogger {
  logStageStart(stage: number, details?: Record<string, unknown>): void;
  logStageComplete(stage: number, details?: Record<string, unknown>): void;
  logDecision(message: string, details?: Record<string, unknown>): void;
  logSummary(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,
});

export function createTelemetryLogger(scope: string, context: TelemetryContext = {}): TelemetryLogger {
  const logger = baseLogger.child({ scope, ...context });

  return {
    logStageStart(stage, details = {}) {
      logger.info({ event: 'stage_start', stage, ...details }, 'Stage start');
    },
    logStageComplete(stage, details = {}) {
      logger.info({ event: 'stage_complete', stage, ...details }, 'Stage complete');
    },
    logDecision(message, details = {}) {
      logger.debug({ event: 'decision', ...details }, message);
    },
    logSummary(message, details = {}) {
      logger.info({ event: 'summary', ...details }, message);
    },
    info(message, details = {}) {
      logger.info(details, message);
    },
    error(message, details = {}) {
      logger.error(details, message);
    },
  };
}
