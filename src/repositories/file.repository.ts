import type { QueueRepository } from './repository.interface.js';
import fs from 'fs/promises';

export class FileQueueRepository<T> implements QueueRepository<T> {
  constructor(private readonly filePath: string) {}

  async loadTasks(): Promise<T[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data || '[]');
    } catch {
      return [];
    }
  }

  async saveTasks(tasks: T[]): Promise<void> {
    const tmpPath = this.filePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(tasks, null, 2));
    await fs.rename(tmpPath, this.filePath); // Atomic swap
  }
}
