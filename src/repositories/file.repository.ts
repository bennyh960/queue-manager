import type { HandlerMap, Task } from '../types/index.js';
import fs from 'fs/promises';
import path from 'path';
import { BaseQueueRepository } from './base.repository.js';
import { FileRepositoryLoadError, FileRepositoryReadError, FileRepositoryTypeMismatchError } from '../util/errors.js';
import type { QueueRepository } from './repository.interface.js';

export class FileQueueRepository extends BaseQueueRepository implements QueueRepository {
  constructor(private readonly filePath: string, maxRetries: number, maxProcessingTime: number) {
    super(maxRetries, maxProcessingTime);
  }

  async deleteTask(id: string, hardDelete?: boolean): Promise<Task<HandlerMap> | undefined> {
    const tasks = await this.loadTasks();
    const index = tasks.findIndex(task => task.id === id);
    if (index === -1) return undefined;

    const deletedTask = tasks[index];
    if (hardDelete) {
      tasks.splice(index, 1);
    } else if (deletedTask) {
      deletedTask.status = 'deleted';
    }
    await this.saveTasks(tasks);
    return deletedTask;
  }

  // Load tasks from file, optionally filter by status
  async loadTasks(status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    try {
      if (path.extname(this.filePath) !== '.json') {
        throw new FileRepositoryTypeMismatchError();
      }
      const data = await fs.readFile(this.filePath, 'utf-8');
      const tasks: Task<HandlerMap>[] = JSON.parse(data || '[]');
      if (status) {
        return tasks.filter(t => t.status === status);
      }
      return tasks;
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') {
        throw new FileRepositoryLoadError(this.filePath, error.path ?? 'unknown');
      }
      throw new FileRepositoryReadError(this.filePath, error.message);
    }
  }

  // Save all tasks to file (ignore status param for file)
  async saveTasks(tasks: Task<HandlerMap>[], _status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
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

  // Add a new task to the file
  async enqueue(task: Task<HandlerMap>): Promise<void> {
    const tasks = await this.loadTasks();
    tasks.push(task);
    await this.saveTasks(tasks);
  }
}
