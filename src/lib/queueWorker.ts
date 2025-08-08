import type { HandlerMap, Task, QueueManagerEvents, LoggerLike } from '../types/index.js';
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

  private async queueWorker() {
    if (!this.queueManager['initialized']) {
      await this.queueManager['init']();
    }
    while (this.workerActive) {
      const task = await this.queueManager.dequeue();
      if (!task) {
        await new Promise(res => setTimeout(res, this.queueManager['delay']));
        await this.queueManager.checkAndHandleStuckTasks();
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
