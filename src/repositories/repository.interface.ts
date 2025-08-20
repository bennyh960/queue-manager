import type { EmitMethod, HandlerMap, LoggerLike, Task } from '../types/index.js';

export interface QueueRepository {
  loadTasks(status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]>;
  saveTasks(tasks: Task<HandlerMap>[], status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]>;
  dequeue(): Promise<Task<HandlerMap> | null>;
  enqueue(task: Task<HandlerMap>): Promise<void>;
  init?(): Promise<void>;
  logger?: LoggerLike;
  emitEvent?: EmitMethod;
  MAX_RETRIES: number;
  MAX_PROCESSING_TIME: number;
  id: string;
  updateTask(id: string, obj: Partial<Task<HandlerMap>>): Promise<Task<HandlerMap> | undefined>;
  deleteTask(id: string, hardDelete?: boolean): Promise<Task<HandlerMap> | undefined>;
}
