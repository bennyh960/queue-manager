import { HandlerRegistry, type HandlerOptions } from './handlerRegistry.js';
import type { QueueRepository } from '../repositories/repository.interface.js';
import { FileQueueRepository } from '../repositories/file.repository.js';
import { MemoryQueueRepository } from '../repositories/memory.repository.js';
import { EventEmitter } from 'events';
import {
  type EmitMethod,
  type HandlerMap,
  type IQueueManager,
  type LoggerLike,
  type QueueBackendConfig,
  type QueueManagerEvents,
  type Task,
} from '../types/index.js';
import { warnings } from '../util/warnings.js';
import { QueueWorker } from './queueWorker.js';
import { RedisQueueRepository } from '../repositories/redis.repository.js';
import { randomUUID } from 'crypto';
import { PostgresQueueRepository } from '../repositories/postgres.repository.js';
import { InvalidHandlerParamsError, MaxRetriesLimitError, UnknownBackendTypeError } from '../util/errors.js';

const singletonRegistry = new HandlerRegistry();

const MAX_PROCESSING_TIME = 10 * 60 * 1000; // 10 minutes in milliseconds
const MAX_RETRIES = 3; // Default max retries for tasks
const MAX_RETRIES_LIMIT = 10; // max retries limit
const DEFAULT_DELAY = 10000; // Default delay between task checks in milliseconds

export class QueueManager<H extends HandlerMap> {
  private readonly emitter = new EventEmitter();

  // If you want to use multiple instances, set `singleton` to false in `getInstance`
  private static instance: QueueManager<HandlerMap>;

  // Delay between task checks in milliseconds
  private readonly delay: number;

  // Register and manage task handlers.
  private readonly registry: HandlerRegistry<HandlerMap>;

  // Repository is the main interface for interacting with the persistent storage backend.
  // It is used to load, save, enqueue, and dequeue tasks.
  private readonly repository: QueueRepository;

  private readonly MAX_RETRIES: number;
  private readonly MAX_PROCESSING_TIME: number;

  backend: QueueBackendConfig;

  private readonly worker: QueueWorker<H>;

  crashOnWorkerError = false;

  private readonly logger: LoggerLike | undefined;

  public on<K extends keyof QueueManagerEvents<H>>(event: K, listener: QueueManagerEvents<H>[K]): this {
    this.emitter.on(event, listener);
    return this;
  }

  public emit: EmitMethod = (event, ...args) => {
    return this.emitter.emit(event, ...args);
  };

  private constructor({
    delay = DEFAULT_DELAY,
    singleton = true,
    maxRetries = MAX_RETRIES,
    maxProcessingTime = MAX_PROCESSING_TIME,
    logger,
    backend,
    repository,
    crashOnWorkerError,
  }: IQueueManager) {
    this.worker = new QueueWorker(this, logger);
    this.repository = repository;
    this.delay = delay;
    this.registry = singleton ? singletonRegistry : new HandlerRegistry();
    this.MAX_RETRIES = maxRetries;
    this.MAX_PROCESSING_TIME = maxProcessingTime;
    this.logger = logger; // Optional logger, can be used for logging events
    this.backend = backend;
    this.crashOnWorkerError = crashOnWorkerError ?? false;

    if (backend.type === 'custom') {
      this.log('warn', warnings.atomicProcessWarning);
    }
  }

  public static getInstance<H extends HandlerMap>(args: Omit<IQueueManager, 'repository'>): QueueManager<H> {
    const maxRetries = args.maxRetries || MAX_RETRIES;
    const maxProcessingTime = args.maxProcessingTime || MAX_PROCESSING_TIME;

    if (maxRetries > MAX_RETRIES_LIMIT) {
      throw new MaxRetriesLimitError(maxRetries);
    }

    const repository: QueueRepository = this.getBackendRepository(args.backend, maxRetries, maxProcessingTime);
    repository.logger = args.logger;

    const isSingleton = args.singleton !== false; // default to singleton
    const delay = args.delay ?? DEFAULT_DELAY;

    if (isSingleton) {
      if (!QueueManager.instance) {
        QueueManager.instance = new QueueManager({
          repository,
          backend: args.backend,
          delay,
          singleton: true,
          maxRetries,
          maxProcessingTime,
          logger: args.logger,
          crashOnWorkerError: args.crashOnWorkerError,
        });
      } else if (QueueManager.instance.repository.id !== repository.id) {
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
      maxRetries,
      maxProcessingTime,
      logger: args.logger,
      crashOnWorkerError: args.crashOnWorkerError,
    });
  }

  private static getBackendRepository(backend: QueueBackendConfig, maxRetries: number, maxProcessingTime: number): QueueRepository {
    switch (backend.type) {
      case 'file':
        return new FileQueueRepository(backend.filePath, maxRetries, maxProcessingTime);
      case 'memory':
        return new MemoryQueueRepository(maxRetries, maxProcessingTime);
      case 'postgres':
        return new PostgresQueueRepository(backend.pg, maxRetries, maxProcessingTime, backend.options);
      case 'redis':
        return new RedisQueueRepository(backend.redisClient, maxRetries, maxProcessingTime, backend.storageName, backend.useLockKey);
      case 'custom':
        return backend.repository;
      default:
        throw new UnknownBackendTypeError();
    }
  }

  async addTaskToQueue<K extends keyof H>(
    handler: K,
    payload: Parameters<H[K]>[0],
    options?: {
      maxRetries?: Task<HandlerMap>['maxRetries'];
      maxProcessingTime?: Task<HandlerMap>['maxProcessingTime'];
      priority?: Task<HandlerMap>['priority'];
      skipOnPayloadError?: boolean;
    }
  ): Promise<Task<H>> {
    if (options?.maxRetries && options?.maxRetries > MAX_RETRIES_LIMIT) {
      throw new MaxRetriesLimitError(options.maxRetries);
    }

    const validationResult = this.validateHandlerParams(handler as string, payload);
    if (!validationResult.isValid) {
      if (options?.skipOnPayloadError) {
        this.log('warn', `skipOnPayloadError set to true, but this task might fail due to invalid payload: ${validationResult.message}`);
      } else {
        throw new InvalidHandlerParamsError(validationResult.message ?? undefined);
      }
    }

    const handlerEntry = this.registry.get(handler as string);

    const task: Task<H> = {
      id: randomUUID(),
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
    await this.repository.enqueue(task as Task<HandlerMap>);

    this.emit('taskAdded', task as Task<HandlerMap>);
    return task;
  }

  //todo async removeTask(id: number): Promise<Task<H> | undefined> {
  //   const task = this.getTaskById(id);
  //   if (task && task.status !== 'deleted') {
  //     task.status = 'deleted';
  //     await this.saveTasks();
  //     // Optionally, remove from in-memory array:
  //     // this.tasks = this.tasks.filter(t => t.id !== id);
  //     this.emit('taskRemoved', task);
  //     return task;
  //   } else if (task && task.status === 'deleted') {
  //     throw new Error(`Task with ID ${id} is already deleted`);
  //   } else {
  //     throw new Error(`Task with ID ${id} not found`);
  //   }
  // }

  //todo public async purgeDeletedTasks() {
  //   const tasksToPurge = this.tasks.filter(task => task.status === 'deleted');
  //   this.tasks = this.tasks.filter(task => task.status !== 'deleted');
  //   await this.saveTasks();
  //   this.emit('tasksPurged', tasksToPurge);
  //   this.log('info', 'Purged deleted tasks from the queue');
  // }

  async updateTask(id: Task<HandlerMap>['id'], obj: Partial<Task<HandlerMap>>): Promise<Task<HandlerMap> | undefined> {
    try {
      return await this.repository.updateTask(id, obj);
    } catch (error) {
      this.log('error', 'Failed to update task:', error);
      throw error;
    }
  }

  async getAllTasks(): Promise<Task<H>[]> {
    try {
      return await this.repository.loadTasks();
    } catch (error) {
      this.log('error', 'Failed to load tasks:', error);
      throw error;
    }
  }

  async getTaskById(id: string): Promise<Task<H> | undefined> {
    const tasks = await this.repository.loadTasks();
    return tasks.find(task => task.id === id);
  }

  async startWorker(concurrency = 1) {
    await this.worker.startWorker(concurrency);
  }

  async stopWorker() {
    await this.worker.stopWorker();
  }

  /**
   * Register a handler for a specific task type.
   * This method registers a handler function for a specific task type,
   * allowing the queue manager to execute the handler when a task of that type is dequeued.
   * @param name The name of the handler
   * @param handler The function to execute for this handler
   * @param options Optional parameters for max retries and processing time
   */
  register<K extends keyof H>(name: K, handler: H[K], options?: HandlerOptions<Parameters<H[K]>[0]>) {
    if (!options || (!options.paramSchema && !options.useAutoSchema)) {
      const warningMessage = warnings.handlerRegistryWarning.replace(/\$1/g, name as string);
      this.log('warn', warningMessage);
    }
    this.registry.register(name as string, handler, options);
  }

  /**
   * Get the registered handler for a specific task type.
   * This method retrieves the handler function and its parameters for a specific task type.
   * - useful for validating payloads before adding tasks to the queue.
   * @param name The name of the handler
   * @returns An object containing the handler function and its parameters
   */
  validateHandlerParams(name: string, payload: any) {
    return this.registry.validateParams(name, payload);
  }

  private log(level: keyof LoggerLike, ...args: any[]) {
    if (this.logger && this.logger[level]) {
      this.logger[level]?.(...args);
    }
  }
}

export default QueueManager;
