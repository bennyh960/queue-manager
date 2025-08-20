import type { Redis } from 'ioredis';
import type { QueueRepository } from '../repositories/repository.interface.js';
import type { Pool } from 'pg';

export type HandlerMap = Record<string, (payload: any) => Promise<any>>;

export interface TaskBase {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'deleted';
  log?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  maxRetries: number;
  maxProcessingTime: number;
  retryCount: number;
  priority: number;
}
export type Task<H extends HandlerMap> = {
  [K in keyof H]: TaskBase & {
    handler: K;
    payload: Parameters<H[K]>[0];
  };
}[keyof H];

export type QueueManagerEvents<H extends HandlerMap> = {
  taskAdded: (task: Task<H>) => void;
  taskStarted: (task: Task<H>) => void;
  taskCompleted: (task: Task<H>) => void;
  taskFailed: (task: Task<H>, error: Error) => void;
  taskRetried: (task: Task<H>) => void;
  taskRemoved: (task: Task<H>) => void;
  tasksPurged: (tasks: Task<H>[]) => void;
  taskStuck: (task: Task<H>) => void;
};

export type QueueBackendConfig =
  | { type: 'file'; filePath: string }
  | { type: 'memory' }
  | { type: 'redis'; redisClient: Redis; storageName?: string; useLockKey?: boolean }
  | { type: 'postgres'; pg: Pool; options?: PostgresOptions }
  | { type: 'custom'; repository: CustomQueueRepositoryProps };

export type CustomQueueRepositoryProps = Omit<QueueRepository, 'logger' | 'emitEvent' | 'init' | 'id'>;

export type PostgresOptions = {
  tableName?: string;
  schema?: string;
  useMigrate?: boolean;
  // customColumnNames?: Record<string, any>;
  // additionalIndexes?: string[];
  // additionalConstraints?: string[];
};
// util
export interface LoggerLike {
  error(...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
  debug?(...args: any[]): void; // Optional, not all loggers implement debug
}

export type ProcessType = 'single' | 'multi-atomic';

export interface IQueueManager {
  repository: QueueRepository;
  delay?: number;
  singleton?: boolean;
  maxRetries?: number;
  maxProcessingTime?: number;
  logger?: LoggerLike;
  backend: QueueBackendConfig;
  crashOnWorkerError?: boolean; // If true, crashes the worker on error
}

export type EmitMethod = <K extends keyof QueueManagerEvents<HandlerMap>>(
  event: K,
  ...args: Parameters<QueueManagerEvents<HandlerMap>[K]>
) => boolean;
