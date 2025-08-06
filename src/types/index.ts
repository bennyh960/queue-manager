import type { QueueRepository } from '../repositories/repository.interface.js';

export type HandlerMap = Record<string, (payload: any) => any>;

export type Task<H extends HandlerMap> = {
  id: number;
  handler: keyof H;
  payload: Parameters<H[keyof H]>[0];
  status: 'pending' | 'processing' | 'done' | 'failed' | 'deleted';
  log: string;
  createdAt: Date;
  updatedAt: Date;
  maxRetries?: number; // Optional per-task override
  maxProcessingTime?: number; // Optional per-task override (ms)
  retryCount: number; // Track retries
  priority?: number; //  Higher = more urgent
};

export type QueueManagerEvents<H extends HandlerMap> = {
  taskAdded: (task: Task<H>) => void;
  taskStarted: (task: Task<H>) => void;
  taskCompleted: (task: Task<H>) => void;
  taskFailed: (task: Task<H>, error: Error) => void;
  taskRetried: (task: Task<H>) => void;
  taskRemoved: (task: Task<H>) => void;
  taskStuck: (task: Task<H>) => void;
};

export type QueueBackendConfig =
  | { type: 'file'; filePath: string }
  | { type: 'memory' }
  | { type: 'custom'; repository: QueueRepository<any> };

// util
export interface LoggerLike {
  error(...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
  debug?(...args: any[]): void; // Optional, not all loggers implement debug
}
