import { HandlerRegistry } from './handlerRegistry.js';
import type { QueueRepository } from '../repositories/repository.interface.js';
import { FileQueueRepository } from '../repositories/file.repository.js';
import { MemoryQueueRepository } from '../repositories/memory.repository.js';
import { EventEmitter } from 'events';
import {
  type HandlerMap,
  type IQueueManager,
  type LoggerLike,
  type ProcessType,
  type QueueBackendConfig,
  type QueueManagerEvents,
  type Task,
} from '../types/index.js';
import { DefaultLogger } from '../util/logger.js';

const singletonRegistry = new HandlerRegistry();

const MAX_PROCESSING_TIME = 10 * 60 * 1000; // 10 minutes in milliseconds
const MAX_RETRIES = 1; // Default max retries for tasks

export class QueueManager<H extends HandlerMap> extends EventEmitter {
  // Singleton instance for QueueManager
  // If you want to use multiple instances, set `singleton` to false in `getInstance`
  // and manage them separately.
  private static instance: QueueManager<any>;

  // In-memory storage for tasks
  // This is not persistent and will be lost on server restart.
  private tasks: Task<H>[] = [];

  // Unique ID for the next task
  // This is used to ensure each task has a unique ID.
  private nextId = 1;

  // Delay between task checks in milliseconds
  // This is used to control how often the queue checks for new tasks.
  private readonly delay: number;

  // Registry for handlers
  // This is used to register and manage task handlers.
  private readonly registry: HandlerRegistry<HandlerMap>;

  // Repository for persistent storage
  // This is used to load and save tasks to a persistent storage backend.
  private readonly repository: QueueRepository<Task<H>>;

  // Initialization state
  // This is used to track whether the queue manager has been initialized.
  private initialized = false;
  // Promise for initialization
  // This is used to ensure that initialization is only done once.
  // If initialization is in progress, this will hold the promise.
  // If initialization is complete, this will be undefined.
  private initPromise?: Promise<void>;

  // Default configuration for max retries and processing time
  // These are used to control how many times a task can be retried and how long
  // a task can be processed before it is considered stuck.
  // These can be overridden on register handler or even when adding a task to the queue.
  private readonly MAX_RETRIES: number;
  private readonly MAX_PROCESSING_TIME: number;

  // Graceful Shutdown / Dynamic Worker Control
  // This is used to control the worker's state and manage graceful shutdowns.
  // `workerActive` indicates whether the worker is currently processing tasks.
  // `workerPromise` holds the promise for the worker's execution.
  // `dequeueLock` is used to prevent multiple processes from dequeuing tasks at the
  // same time, ensuring that only one task is processed at a time.
  // This is important for maintaining the integrity of the queue and preventing
  // race conditions.
  private workerActive = false;
  private workerPromise?: Promise<void[]>;

  // single process concurrency lock.but for multiple processes -  need atomic update in storage backend.
  private dequeueLock = false;

  // is the queue can run only on one process/server or can be run on multiple processes/servers.
  // This is used to determine how the queue manager should handle task processing.
  // if 'multi-atomic', it means the queue can be processed by multiple instances so the responsibility of atomic dequeueing is on the storage backend.
  // if 'single', it means the queue can only be processed by a single instance at a time - the library handle atomic dequeue.
  processType: ProcessType;

  backend: QueueBackendConfig;

  private readonly logger: LoggerLike | undefined;

  public override on<K extends keyof QueueManagerEvents<H>>(event: K, listener: QueueManagerEvents<H>[K]): this {
    return super.on(event, listener);
  }

  public override emit<K extends keyof QueueManagerEvents<H>>(event: K, ...args: Parameters<QueueManagerEvents<H>[K]>): boolean {
    return super.emit(event, ...args);
  }

  private constructor({
    processType,
    delay = 500,
    singleton = true,
    maxRetries = MAX_RETRIES,
    maxProcessingTime = MAX_PROCESSING_TIME,
    logger = new DefaultLogger(),
    backend,
    repository,
  }: IQueueManager<H>) {
    super();
    this.repository = repository;
    this.delay = delay;
    this.registry = singleton ? singletonRegistry : new HandlerRegistry();
    this.MAX_RETRIES = maxRetries;
    this.MAX_PROCESSING_TIME = maxProcessingTime;
    this.logger = logger; // Optional logger, can be used for logging events
    this.processType = processType;
    this.backend = backend;
  }

  /**
   * Get an instance of QueueManager.
   * If `singleton` is true, it returns the same instance every time.
   * If `singleton` is false, it creates a new instance each time.
   * @param args Configuration for the queue manager
   */
  public static getInstance<H extends HandlerMap>(args: Omit<IQueueManager<H>, 'repository'>): QueueManager<H> {
    const repository: QueueRepository<Task<H>> = this.getBackendRepository(args.backend);

    const isSingleton = args.singleton !== false; // default to singleton
    const delay = args.delay ?? 500;

    if (isSingleton) {
      if (!QueueManager.instance) {
        QueueManager.instance = new QueueManager({
          repository,
          backend: args.backend,
          delay,
          processType: args.processType,
          singleton: true,
          maxRetries: MAX_RETRIES,
          maxProcessingTime: MAX_PROCESSING_TIME,
          logger: args.logger,
        });
      } else if (QueueManager.instance.repository !== repository) {
        // Optional: warn if repository is different from the original
        QueueManager.instance.log('warn', 'Different repository detected for singleton instance');
      }
      return QueueManager.instance as QueueManager<H>;
    }
    return new QueueManager({
      repository,
      delay,
      singleton: false,
      backend: args.backend,
      maxRetries: MAX_RETRIES,
      maxProcessingTime: MAX_PROCESSING_TIME,
      logger: args.logger,
      processType: args.processType,
    });
  }

  /**
   * Get the backend repository based on the configuration.
   * This method creates and returns the appropriate repository instance
   * based on the backend type specified in the configuration.
   * @param backend Configuration for the queue backend
   */
  private static getBackendRepository<H extends HandlerMap>(backend: QueueBackendConfig): QueueRepository<Task<HandlerMap>> {
    switch (backend.type) {
      case 'file':
        return new FileQueueRepository<Task<HandlerMap>>(backend.filePath);
      case 'memory':
        return new MemoryQueueRepository<Task<HandlerMap>>();
      case 'custom':
        return backend.repository;
      default:
        throw new Error('Unknown backend type');
    }
  }

  /**
   * Initialize the queue manager.
   * This method loads tasks from the repository and sets the next ID for new tasks.
   * It ensures that the queue manager is ready to process tasks.
   */
  private async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      await this.loadTasksFromRepository();
      this.nextId = this.tasks.length > 0 ? Math.max(...this.tasks.map(t => t.id)) + 1 : 1;
      this.initialized = true;
      this.log('info', `queue manager initialized with ${this.tasks.length} tasks`);
    })();
    return await this.initPromise;
  }

  /**
   * Load tasks from the repository.
   * This method retrieves tasks from the persistent storage backend and populates
   * the in-memory task array.
   */
  async loadTasksFromRepository(): Promise<void> {
    if (!this.repository) {
      throw new Error('Repository is not initialized');
    }
    this.tasks = await this.repository.loadTasks();
  }

  /**
   * Save tasks to the repository.
   * This method saves the current in-memory task array to the persistent storage backend.
   */
  private async saveTasks() {
    const taskResponse = await this.repository.saveTasks(this.tasks);
    if (taskResponse && !Array.isArray(taskResponse)) {
      throw new Error('Failed to save tasks to repository: expected an array response');
    }

    if (taskResponse && taskResponse.length && typeof taskResponse[0] !== 'object') {
      throw new Error('Failed to save tasks to repository: expected an array of task objects');
    }

    if (!taskResponse && this.backend.type === 'custom') {
      throw new Error('Failed to save tasks to repository: custom repository did not return tasks');
    }
    this.tasks = taskResponse;
  }

  /**
   * Add a task to the queue.
   * This method creates a new task with the specified handler and payload,
   * and adds it to the in-memory task array. It also saves the tasks to the repository.
   * @param handler The name of the handler to execute for this task
   * @param payload The data to be processed by the handler
   * @param options Optional parameters for max retries and processing time
   */
  async addTaskToQueue<K extends keyof H>(
    handler: K,
    payload: Parameters<H[K]>[0],
    options?: { maxRetries?: number; maxProcessingTime?: number; priority?: number }
  ): Promise<Task<H>> {
    if (!this.initialized) {
      await this.init();
    }

    const handlerEntry = this.registry.get(handler as string);

    const task: Task<H> = {
      id: this.nextId++,
      payload,
      handler: handler as string,
      status: 'pending',
      log: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      maxRetries: options?.maxRetries ?? handlerEntry?.options?.maxRetries ?? this.MAX_RETRIES,
      maxProcessingTime: options?.maxProcessingTime ?? handlerEntry?.options?.maxProcessingTime ?? this.MAX_PROCESSING_TIME,
      retryCount: 0,
      priority: options?.priority ?? 0, //todo: bug with schema optional/default should not show ts error
    };
    this.tasks.push(task);
    await this.saveTasks();
    this.emit('taskAdded', task);
    return task;
  }

  /**
   * Remove a task from the queue by ID.
   * This method marks a task as deleted and saves the updated task list to the repository.
   * @param id The ID of the task to remove
   */
  async removeTask(id: number): Promise<Task<H> | undefined> {
    const task = this.getTaskById(id);
    if (task && task.status !== 'deleted') {
      task.status = 'deleted';
      await this.saveTasks();
      // Optionally, remove from in-memory array:
      // this.tasks = this.tasks.filter(t => t.id !== id);
      this.emit('taskRemoved', task);
      return task;
    } else if (task && task.status === 'deleted') {
      throw new Error(`Task with ID ${id} is already deleted`);
    } else {
      throw new Error(`Task with ID ${id} not found`);
    }
  }

  /**
   * Sort tasks by priority and creation date.
   * This method sorts tasks based on their priority and creation date.
   * Higher priority tasks are processed first, and if priorities are equal,
   * older tasks are processed first.
   */
  private readonly sortTasksByPriority = (a: Task<H>, b: Task<H>): number => {
    return (b.priority ?? 0) - (a.priority ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  };

  /**
   * Single dequeue method for 'single' process type.
   * This method ensures that only one task is dequeued at a time,
   * and it handles the dequeue lock internally.
   */
  private async singleDequeue(): Promise<Task<H> | undefined> {
    if (this.dequeueLock) return undefined;
    this.dequeueLock = true;

    try {
      const task = [...this.tasks].sort(this.sortTasksByPriority).find(t => t.status === 'pending');
      if (task) {
        task.status = 'processing';
        await this.saveTasks();
        return task;
      }
      return undefined;
    } finally {
      this.dequeueLock = false;
    }
  }

  // Multi-process dequeue method for 'multi-atomic' process type.
  // This method is designed to be used with a custom backend that supports atomic dequeueing.
  // It assumes that the repository has a `dequeue` method that handles atomic dequeueing.
  // If the backend does not support this, it will throw an error.
  private async multiProcessDequeue(): Promise<Task<H> | undefined> {
    if (this.backend.type !== 'custom') {
      this.log(
        'warn',
        'Multi-process dequeue is only required with custom backend storage, please use "single" process type instead if you don\'t want to create your own dequeue logic.'
      );
    }

    if (typeof this.repository.dequeue !== 'function') {
      throw new Error(
        'processType is set to "multi-atomic": your repository must implement an atomic dequeueTask() method. See documentation.'
      );
    }
    const task = await this.repository.dequeue();

    return task ?? undefined;
  }

  /**
   * Dequeue a task from the queue.
   * This method finds the next pending task, marks it as processing, and returns it.
   * It also saves the updated task list to the repository.
   * If no pending tasks are found, it returns undefined.
   */
  async dequeue(): Promise<Task<H> | undefined> {
    // If the process type is 'multi-atomic', we assume the backend handles atomic dequeueing.
    if (this.processType === 'multi-atomic' || this.backend.type === 'custom') {
      return await this.multiProcessDequeue();
    }

    // If the process type is 'single', we handle atomic dequeueing ourselves.
    // This prevents multiple workers that run concurrently  from dequeuing tasks at the same time.
    return await this.singleDequeue();
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

  /**
   * Update the retry count for a task and reset its status to 'pending'.
   * This method increments the retry count for a task and resets its status to 'pending'.
   * It also saves the updated task list to the repository.
   * @param id The ID of the task to update
   */
  async updateTaskRetryCount(id: number): Promise<Task<H> | undefined> {
    const task = this.getTaskById(id);
    if (task) {
      task.retryCount++;
      task.updatedAt = new Date();

      task.status = 'pending';
      await this.saveTasks();
      this.emit('taskRetried', task);
      return task;
    }
    return undefined;
  }

  /**
   * Check and handle stuck tasks.
   * This method checks for tasks that are stuck in the 'processing' state for too long
   * and either retries them or marks them as failed based on their retry count.
   * stuck is defined as tasks that have been in 'processing' state longer than `maxProcessingTime` as follow: task level > handler level > instance level
   */
  async checkAndHandleStuckTasks(): Promise<void> {
    const now = Date.now();
    for (const task of this.tasks) {
      if (task.status === 'processing') {
        const elapsed = now - new Date(task.updatedAt).getTime();
        this.log('info', `Checking task ${task.id} status: elapsed time ${elapsed}ms`);
        const maxProcessingTime = task.maxProcessingTime ?? this.MAX_PROCESSING_TIME;
        if (elapsed > maxProcessingTime) {
          this.emit('taskStuck', task);
          this.log('warn', `Task ${task.id} is stuck`);
          const maxRetries = task.maxRetries ?? this.MAX_RETRIES;
          if (task.retryCount < maxRetries) {
            this.log('warn', `Retrying task ${task.id} (${task.retryCount + 1}/${maxRetries})`);
            await this.updateTaskRetryCount(task.id);
          } else {
            await this.updateTaskStatus(task.id, 'failed', `Task failed after ${task.retryCount}/${maxRetries} retries`);
          }
        }
      }
    }
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
    // Wait for worker to finish current task
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
        this.emit('taskStarted', task);
        const handler = this.registry.get(task.handler as string);

        if (!handler) throw new Error('Handler not found');
        await handler.fn(task.payload);
        await this.updateTaskStatus(task.id, 'done');
        this.emit('taskCompleted', task);
      } catch (err: any) {
        this.log('error', `Task ${task.id} failed:`, err);
        const log = err?.message?.toString() || 'Unknown error';
        this.updateTaskStatus(task.id, 'failed', log);
        const emitError = err instanceof Error ? err : new Error(String(err));
        this.emit('taskFailed', task, emitError);
      }
    }
  }

  /**
   * Register a handler for a specific task type.
   * This method registers a handler function for a specific task type,
   * allowing the queue manager to execute the handler when a task of that type is dequeued.
   * @param name The name of the handler
   * @param handler The function to execute for this handler
   * @param options Optional parameters for max retries and processing time
   */
  register<K extends string, F extends (payload: any) => any>(
    name: K,
    handler: F,
    options?: { maxRetries?: number; maxProcessingTime?: number }
  ) {
    this.registry.register(name, handler, options);
  }

  /**
   * Get the registered handler for a specific task type.
   * This method retrieves the handler function and its parameters for a specific task type.
   * - useful for validating payloads before adding tasks to the queue.
   * @param name The name of the handler
   * @returns An object containing the handler function and its parameters
   */
  inspectHandler(name: string) {
    return this.registry.inspectHandler(name);
  }

  private log(level: keyof LoggerLike, ...args: any[]) {
    if (this.logger && this.logger[level]) {
      this.logger[level]?.(...args);
    }
  }
}

export default QueueManager;
