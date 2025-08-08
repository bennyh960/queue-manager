import type { HandlerMap, LoggerLike } from '../types/index.js';
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

  /**
   * Queue worker function.
   * This function runs in a loop, dequeuing tasks and processing them.
   * It handles task execution, error handling, and task status updates.
   * * It emits events for task lifecycle changes such as task started, completed, failed, retried, and removed.
   * * It also checks for stuck tasks and handles them accordingly.
   * * @remarks
   * This method is designed to be run in a loop, continuously processing tasks from the queue.
   * * It will keep running until `workerActive` is set to false, allowing for graceful shutdowns.
   * * @returns A promise that resolves when the worker stops processing tasks.
   * * @throws Error if the handler for a task is not found.
   * * @example
   * ```typescript
   * const queue = QueueManager.getInstance<HandlerMap>({ backend: { type: 'file', filePath: './data/tasks.json' } });
   * queue.register('sendEmail', sendEmail, { maxRetries: 3, maxProcessingTime: 2000 });
   * queue.register('resizeImage', resizeImage);
   * queue.startWorker();
   *
   *
   * */
  private async queueWorker() {
    if (!this.queueManager['initialized']) {
      await this.queueManager['init']();
    }
    while (this.workerActive) {
      const task = await this.queueManager.dequeue();
      if (!task) {
        await new Promise(res => setTimeout(res, this.queueManager['delay']));
        await this.queueManager.checkAndHandleStuckTasks();
        // console.log('No task found, waiting...');
        continue;
      }
      try {
        this.queueManager.emit('taskStarted', task);
        const handler = this.queueManager['registry'].get(task.handler as string);
        if (!handler) throw new Error('Handler not found');
        await handler.fn(task.payload);
        await this.queueManager.updateTaskStatus(task.id, 'done');
        this.queueManager.emit('taskCompleted', task);
      } catch (err: any) {
        this.log('error', `Task ${task.id} failed:`, err);
        const log = err?.message?.toString() || 'Unknown error';
        this.queueManager.updateTaskStatus(task.id, 'failed', log);
        const emitError = err instanceof Error ? err : new Error(String(err));
        if (this.queueManager.crashOnWorkerError) {
          this.workerActive = false;
          throw emitError;
        } else {
          this.queueManager.emit('taskFailed', task, emitError);
        }
      }
    }
  }

  private log(level: keyof LoggerLike, ...args: any[]) {
    if (this.logger && this.logger[level]) {
      this.logger[level]?.(...args);
    }
  }
}
