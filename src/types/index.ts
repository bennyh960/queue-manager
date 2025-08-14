import type { Redis } from 'ioredis';
import type { QueueRepository } from '../repositories/repository.interface.js';
import type { TypeOf } from '../util/schema.util.js';
import type { TaskSchema } from '../util/task.schema.js';

export type HandlerMap = Record<string, (payload: any) => any | Promise<any>>;

type TaskSchemaBase = Omit<TypeOf<typeof TaskSchema>, 'handler' | 'payload'>;

type TaskFromSchemaAndHandler<H extends HandlerMap> = {
  [K in keyof H]: TaskSchemaBase & {
    handler: K;
    payload: Parameters<H[K]>[0];
  };
}[keyof H];

export type Task<H extends HandlerMap> = TaskFromSchemaAndHandler<H>;

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
  | { type: 'redis'; redisClient: Redis; storageName?: string }
  | { type: 'custom'; repository: QueueRepository };

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
