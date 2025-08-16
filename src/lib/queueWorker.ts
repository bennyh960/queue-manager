import type { HandlerMap, LoggerLike, Task } from '../types/index.js';
import { TaskProcessingTimeoutError } from '../util/errors.js';
import type QueueManager from './QueueManager.js';

export class QueueWorker<H extends HandlerMap> {
  private workerActive = false;
  private workerPromise?: Promise<void[]>;
  private readonly logger: LoggerLike | undefined;

  constructor(private readonly queueManager: QueueManager<H>, logger?: LoggerLike) {
    this.logger = logger;
  }

  async startWorker(concurrency = 1) {
    this.log('info', `Starting ${concurrency} workers`);
    this.workerActive = true;
    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(this.queueWorker());
    }
    this.workerPromise = Promise.all(workers);
  }

  async stopWorker() {
    this.log('info', 'Worker stopping...');
    this.workerActive = false;
    await this.workerPromise;
    this.log('info', 'Worker stopped');
  }

  private async processTaskWithTimeout(task: Task<HandlerMap>): Promise<any> {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new TaskProcessingTimeoutError()), task.maxProcessingTime + 1000);
    });
    try {
      const promise = this.processTask(task);
      return await Promise.race([promise, timeoutPromise]);
    } catch (err) {
      if (err instanceof TaskProcessingTimeoutError) {
        if (task.retryCount <= task.maxRetries) {
          task.retryCount++;
          this.queueManager.emit('taskRetried', task);
          clearTimeout(timeoutId);
          this.log('error', `${task.id}:`, err);
          return await this.processTaskWithTimeout(task);
        } else {
          this.log('error', `Task ${task.id} failed:`, err);
          throw new Error(`Task ${task.id} failed after max retries: ${err.message}`);
        }
      } else {
        throw err; // Re-throw unexpected errors
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async queueWorker() {
    while (this.workerActive) {
      const task = await this.queueManager['repository'].dequeue();
      if (task) {
        try {
          await this.processTaskWithTimeout(task);
        } catch (err: any) {
          await this.handleTaskError(task, err);
        }
      } else {
        await new Promise(res => setTimeout(res, this.queueManager['delay']));
      }
    }
  }

  private async processTask(task: Task<HandlerMap>) {
    this.queueManager.emit('taskStarted', task);

    const handler = this.queueManager['registry'].get(task.handler);
    if (!handler) throw new Error('Handler not found');

    await handler.fn(task.payload);
    await this.queueManager['repository'].updateTask(task.id, { status: 'done' });

    this.queueManager.emit('taskCompleted', task);
  }

  private async handleTaskError(task: Task<HandlerMap>, err: any) {
    this.log('error', `Task ${task.id} failed:`, err);

    const log = err?.message?.toString() || 'Unknown error';
    await this.queueManager['repository'].updateTask(task.id, { status: 'failed', log });

    const emitError = err instanceof Error ? err : new Error(String(err));

    if (this.queueManager.crashOnWorkerError) {
      this.workerActive = false;
      throw emitError;
    } else {
      this.queueManager.emit('taskFailed', task, emitError);
    }
  }

  private log(level: keyof LoggerLike, ...args: any[]) {
    if (this.logger && this.logger[level]) {
      this.logger[level]?.(...args);
    }
  }
}
