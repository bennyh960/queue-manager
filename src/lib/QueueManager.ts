import { HandlerRegistry } from './handlerRegistry.js';
import type { QueueRepository } from './repositories/repository.interface.js';
import { FileQueueRepository } from './repositories/file.repository.js';
import { MemoryQueueRepository } from './repositories/memory.repository.js';

export type Task<H extends Record<string, (payload: any) => any>> = {
  id: number;
  handler: keyof H;
  payload: Parameters<H[keyof H]>[0];
  status: 'pending' | 'processing' | 'done' | 'failed';
  log: string;
  createdAt: Date;
  updatedAt: Date;
  maxRetries?: number; // Optional per-task override
  maxProcessingTime?: number; // Optional per-task override (ms)
  retryCount: number; // Track retries
};

type QueueBackendConfig = { type: 'file'; filePath: string } | { type: 'memory' } | { type: 'custom'; repository: QueueRepository<any> };

const singletonRegistry = new HandlerRegistry();

const MAX_PROCESSING_TIME = 10 * 60 * 1000; // 10 minutes in milliseconds

export class QueueManager<H extends Record<string, (payload: any) => any>> {
  private static instance: QueueManager<any>;
  private tasks: Task<H>[] = [];
  private nextId = 1;
  private readonly delay: number;
  private readonly registry: HandlerRegistry<Record<string, (payload: any) => any>>;
  private readonly repository: QueueRepository<Task<H>>;
  private initialized = false;
  private initPromise?: Promise<void>;
  private readonly MAX_RETRIES: number;
  private readonly MAX_PROCESSING_TIME: number;

  // Graceful Shutdown / Dynamic Worker Control
  private workerActive = false;
  private workerPromise?: Promise<void[]>;

  private constructor(
    repository: QueueRepository<Task<H>>,
    delay: number = 500,
    singleton: boolean = true,
    maxRetries: number = 1,
    maxProcessingTime: number = MAX_PROCESSING_TIME
  ) {
    this.repository = repository;
    this.delay = delay;
    this.registry = singleton ? singletonRegistry : new HandlerRegistry();
    this.MAX_RETRIES = maxRetries;
    this.MAX_PROCESSING_TIME = maxProcessingTime;
  }

  public static getInstance<H extends Record<string, (payload: any) => any>>(args: {
    backend: QueueBackendConfig;
    delay?: number;
    singleton?: boolean;
  }): QueueManager<H> {
    const repository: QueueRepository<Task<H>> = this.getBackendRepository(args.backend);

    const isSingleton = args.singleton !== false; // default to singleton
    const delay = args.delay ?? 500;

    if (isSingleton) {
      if (!QueueManager.instance) {
        QueueManager.instance = new QueueManager(repository, delay, true);
      } else {
        // Optional: warn if repository is different from the original
        if (QueueManager.instance.repository !== repository) {
          console.warn('Different repository detected for singleton instance');
        }
      }
      return QueueManager.instance as QueueManager<H>;
    }
    return new QueueManager(repository, delay, false);
  }

  private static getBackendRepository<H extends Record<string, (payload: any) => any>>(
    backend: QueueBackendConfig
  ): QueueRepository<Task<H>> {
    switch (backend.type) {
      case 'file':
        return new FileQueueRepository<Task<H>>(backend.filePath);
      case 'memory':
        return new MemoryQueueRepository<Task<H>>();
      case 'custom':
        return backend.repository;
      default:
        throw new Error('Unknown backend type');
    }
  }

  private async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      await this.loadTasksFromRepository();
      this.nextId = this.tasks.length > 0 ? Math.max(...this.tasks.map(t => t.id)) + 1 : 1;
      this.initialized = true;
      console.log(`JsonQueue initialized with ${this.tasks.length} tasks`);
    })();
    return await this.initPromise;
  }

  async loadTasksFromRepository(): Promise<void> {
    if (!this.repository) {
      throw new Error('Repository is not initialized');
    }
    this.tasks = await this.repository.loadTasks();
  }

  private async saveTasks() {
    await this.repository.saveTasks(this.tasks);
  }

  async addTaskToQueue<K extends keyof H>(
    handler: K,
    payload: Parameters<H[K]>[0],
    options?: { maxRetries?: number; maxProcessingTime?: number }
  ): Promise<Task<H>> {
    if (!this.initialized) {
      await this.init();
    }

    const handlerEntry = this.registry.get(handler as string);

    const task: Task<H> = {
      id: this.nextId++,
      payload,
      handler,
      status: 'pending',
      log: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      maxRetries: options?.maxRetries ?? handlerEntry?.options?.maxRetries ?? this.MAX_RETRIES,
      maxProcessingTime: options?.maxProcessingTime ?? handlerEntry?.options?.maxProcessingTime ?? this.MAX_PROCESSING_TIME,
      retryCount: 0,
    };
    this.tasks.push(task);
    await this.saveTasks();
    return task;
  }

  async dequeue(): Promise<Task<H> | undefined> {
    const task = this.tasks.find(t => t.status === 'pending');
    if (task) {
      task.status = 'processing';
      await this.saveTasks();
      return task;
    }
    return undefined;
  }

  getAllTasks(): Task<H>[] {
    return this.tasks;
  }

  getTaskById(id: number): Task<H> | undefined {
    return this.tasks.find(task => task.id === id);
  }

  async updateTaskStatus(id: number, status: 'pending' | 'processing' | 'done' | 'failed', log?: string): Promise<Task<H> | undefined> {
    const task = this.getTaskById(id);
    if (task) {
      task.status = status;
      task.updatedAt = new Date();
      if (log) {
        task.log = log;
      }
      await this.saveTasks();
      return task;
    }
    return undefined;
  }

  async updateTaskRetryCount(id: number): Promise<Task<H> | undefined> {
    const task = this.getTaskById(id);
    if (task) {
      task.retryCount++;
      task.updatedAt = new Date();

      task.status = 'pending';
      await this.saveTasks();
      return task;
    }
    return undefined;
  }

  async checkAndHandleStuckTasks(): Promise<void> {
    const now = Date.now();
    for (const task of this.tasks) {
      if (task.status === 'processing') {
        const elapsed = now - new Date(task.updatedAt).getTime();
        console.log(`Checking task ${task.id} status: elapsed time ${elapsed}ms`);
        const maxProcessingTime = task.maxProcessingTime ?? this.MAX_PROCESSING_TIME;
        if (elapsed > maxProcessingTime) {
          console.warn(`Task ${task.id} is stuck`);
          const maxRetries = task.maxRetries ?? this.MAX_RETRIES;
          if (task.retryCount < maxRetries) {
            console.warn(`Retrying task ${task.id} (${task.retryCount + 1}/${maxRetries})`);
            await this.updateTaskRetryCount(task.id);
          } else {
            await this.updateTaskStatus(task.id, 'failed', `Task failed after ${task.retryCount}/${maxRetries} retries`);
          }
        }
      }
    }
  }

  async startWorker(concurrency = 1) {
    console.log(`Starting ${concurrency} workers`);
    this.workerActive = true;
    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(this.queueWorker());
    }
    this.workerPromise = Promise.all(workers);
  }

  async stopWorker() {
    console.log('Worker stopping...');
    this.workerActive = false;
    // Wait for worker to finish current task
    await this.workerPromise;
    console.log('Worker stopped');
  }

  private async queueWorker() {
    if (!this.initialized) {
      await this.init();
    }
    while (this.workerActive) {
      const task = await this.dequeue();
      if (!task) {
        await new Promise(res => setTimeout(res, this.delay));
        await this.checkAndHandleStuckTasks();
        continue;
      }
      try {
        const handler = this.registry.get(task.handler as string);

        if (!handler) throw new Error('Handler not found');
        await handler.fn(task.payload);
        await this.updateTaskStatus(task.id, 'done');
      } catch (err: any) {
        console.error(`Task ${task.id} failed:`, err);
        const log = err?.message?.toString() || 'Unknown error';
        this.updateTaskStatus(task.id, 'failed', log);
      }
    }
  }

  register<K extends string, F extends (payload: any) => any>(
    name: K,
    handler: F,
    options?: { maxRetries?: number; maxProcessingTime?: number }
  ) {
    this.registry.register(name, handler, options);
  }

  getRegisteredHandler(name: string) {
    const handler = this.registry.get(name);
    if (!handler) {
      return { params: undefined, fn: undefined, options: undefined };
    }

    const fnStr = handler.fn.toString().replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    // Match function ( { key1, key2 } ) or ( {key1, key2} )
    const match = fnStr.match(/\{\s*([^}]*)\s*\}/);
    if (!match || !match[1]) return { params: undefined, ...handler };
    // Split by comma, trim spaces, remove default values
    const params = match[1]
      .split(',')
      .map(k => k.split('=')[0]?.trim())
      .filter(Boolean);

    return { params, ...handler };
  }
}

export default QueueManager;
