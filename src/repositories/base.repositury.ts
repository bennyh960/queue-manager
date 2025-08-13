import type { EmitMethod, HandlerMap, LoggerLike, Task } from '../types/index.js';
import type { QueueRepository } from './repository.interface.js';
import { randomUUID } from 'crypto';

export abstract class BaseQueueRepository implements QueueRepository {
  logger?: LoggerLike;
  emitEvent?: EmitMethod;
  MAX_RETRIES: number;
  MAX_PROCESSING_TIME: number;

  readonly id: string;

  protected dequeueLock = false;

  constructor(maxRetries: number, maxProcessingTime: number) {
    this.MAX_RETRIES = maxRetries;
    this.MAX_PROCESSING_TIME = maxProcessingTime;
    this.id = randomUUID();
  }

  abstract loadTasks(status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]>;
  abstract saveTasks(tasks: Task<HandlerMap>[], status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]>;
  abstract enqueue(task: Task<HandlerMap>): Promise<void>;

  // same for in-memory and file repositories, others will be overridden
  async updateTask(id: string, obj: Partial<Task<HandlerMap>>): Promise<Task<HandlerMap> | undefined> {
    const tasks = await this.loadTasks();
    const task = tasks.find(t => t.id === id);
    if (task) {
      Object.assign(task, obj);
      task.updatedAt = new Date();
      await this.saveTasks(tasks);
      return task;
    }
    return undefined;
  }

  sortTasksToDequeue(taskA: Task<HandlerMap>, taskB: Task<HandlerMap>): number {
    return taskB.priority - taskA.priority || new Date(taskA.createdAt).getTime() - new Date(taskB.createdAt).getTime();
  }

  // same for in-memory and file repositories, others will be overridden
  async dequeue(): Promise<Task<HandlerMap> | null> {
    if (this.dequeueLock) return null;
    this.dequeueLock = true;
    try {
      const tasks = await this.loadTasks();
      const taskToProcess = [...tasks].sort(this.sortTasksToDequeue).find(t => t.status === 'pending');
      if (taskToProcess) {
        taskToProcess.status = 'processing';
        await this.saveTasks(tasks);
        return taskToProcess;
      } else {
        await this.checkAndHandleStuckTasks(tasks);
        return null;
      }
    } finally {
      this.dequeueLock = false;
    }
  }

  protected async checkAndHandleStuckTasks(tasks: Task<HandlerMap>[]): Promise<void> {
    const now = Date.now();
    for (const task of tasks) {
      if (task.status !== 'processing') continue;
      const elapsed = now - new Date(task.updatedAt).getTime();
      this.logger?.info(`Checking task ${task.id} status: elapsed time ${elapsed / 1000}s`);
      const maxProcessingTime = task.maxProcessingTime ?? this.MAX_PROCESSING_TIME;
      if (elapsed > maxProcessingTime) {
        this.emitEvent?.('taskStuck', task);
        this.logger?.warn(`Task ${task.id} is stuck`);
        const maxRetries = task.maxRetries ?? this.MAX_RETRIES;
        if (task.retryCount < maxRetries) {
          this.logger?.warn(`Retrying task ${task.id} (${task.retryCount + 1}/${maxRetries})`);
          await this.updateTask(task.id, { retryCount: task.retryCount + 1, status: 'pending' });
          this.emitEvent?.('taskRetried', task);
        } else {
          const error = `Task ${task.id} failed after ${maxRetries} retries`;
          this.emitEvent?.('taskFailed', task, new Error(error));
          this.logger?.error(error);
          await this.updateTask(task.id, { status: 'failed' });
        }
      }
    }
  }
}
