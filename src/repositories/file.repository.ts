import type { QueueRepository } from './repository.interface.js';
import fs from 'fs/promises';
import path from 'path';

export class FileQueueRepository<T> implements QueueRepository<T> {
  constructor(private readonly filePath: string) {}

  async loadTasks(): Promise<T[]> {
    try {
      if (path.extname(this.filePath) !== '.json') {
        throw new Error('File path must end with .json');
      }
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data || '[]');
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        throw new Error(
          `Error loading tasks from ${this.filePath}.\n The ${error.path} does not exist.\nPlease create the directory first`
        );
      }
      throw new Error('Error loading tasks from file: ' + error.message);
    }
  }

  async saveTasks(tasks: T[]): Promise<T[]> {
    try {
      const tmpPath = this.filePath + '.tmp';
      const dir = path.dirname(tmpPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(tasks, null, 2));
      await fs.rename(tmpPath, this.filePath); // Atomic swap
      return tasks;
    } catch (error) {
      console.error('Error saving tasks to file:', error);
      throw error;
    }
  }
}
