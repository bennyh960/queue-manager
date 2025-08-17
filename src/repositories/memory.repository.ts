import type { HandlerMap, Task } from '../types/index.js';
import { BaseQueueRepository } from './base.repository.js';
import type { QueueRepository } from './repository.interface.js';

export class MemoryQueueRepository extends BaseQueueRepository implements QueueRepository {
  private tasks: Task<HandlerMap>[] = [];

  constructor(maxRetries: number, maxProcessingTime: number) {
    super(maxRetries, maxProcessingTime);
  }

  // Storage-specific: return all tasks, optionally filter by status
  async loadTasks(status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    if (status) {
      return this.tasks.filter(t => t.status === status);
    }
    return this.tasks;
  }

  // Storage-specific: replace all tasks (ignore status param for memory)
  async saveTasks(tasks: Task<HandlerMap>[], _status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    this.tasks = tasks;
    return tasks;
  }

  // Storage-specific: push a new task into memory
  async enqueue(task: Task<HandlerMap>): Promise<void> {
    this.tasks.push(task);
  }
}
