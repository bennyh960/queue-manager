import type { QueueRepository } from './repository.interface.js';

export class MemoryQueueRepository<T> implements QueueRepository<T> {
  private tasks: T[] = [];

  async loadTasks(): Promise<T[]> {
    return this.tasks;
  }

  async saveTasks(tasks: T[]): Promise<void> {
    this.tasks = tasks;
  }
}
