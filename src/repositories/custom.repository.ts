import { TaskSchema } from '../util/task.schema.js';
import type { QueueRepository } from './repository.interface.js';

export class CustomQueueRepository<T> implements QueueRepository<T> {
  private readonly _loadTasks: () => Promise<T[]>;
  private readonly _saveTasks: (tasks: T[]) => Promise<T[]>;
  private readonly _dequeue: () => Promise<T | null>;

  constructor(params: { loadTasks: () => Promise<T[]>; saveTasks: (tasks: T[]) => Promise<T[]>; dequeue: () => Promise<T | null> }) {
    this._loadTasks = params.loadTasks;
    this._saveTasks = params.saveTasks;
    this._dequeue = params.dequeue;
  }

  async loadTasks(): Promise<T[]> {
    const tasks = await this._loadTasks();
    if (!tasks || !Array.isArray(tasks)) {
      throw new Error('Invalid tasks loaded from custom repository');
    }
    if (tasks[0]) {
      TaskSchema.validateAll(tasks[0]);
    }
    return tasks;
  }

  async saveTasks(tasks: T[]): Promise<T[]> {
    return await this._saveTasks(tasks);
  }

  async dequeue(): Promise<T | null> {
    const task = await this._dequeue();
    if (task) {
      TaskSchema.validateAll(task);
    }
    return task;
  }
}
