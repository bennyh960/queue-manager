import type { HandlerMap, QueueBackendConfig, Task } from '../types/index.js';
import { BaseQueueRepository } from './base.repositury.js';
import type { Redis } from 'ioredis';

export class RedisQueueRepository extends BaseQueueRepository {
  private readonly redis: Redis;
  storageName: string;

  constructor(
    redisClient: Redis,
    maxRetries: number,
    maxProcessingTime: number,
    storageName?: Extract<QueueBackendConfig, { type: 'redis' }>['storageName']
  ) {
    super(maxRetries, maxProcessingTime);
    this.redis = redisClient;
    this.storageName = storageName || 'queue-manager';
  }

  // Load all tasks by status
  async loadTasks(status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    if (!status) {
      // Load all task IDs from all status lists, then fetch all tasks
      const statuses = ['pending', 'processing', 'failed', 'completed'];
      const allIds = (await Promise.all(statuses.map(s => this.redis.lrange(`${this.storageName}:queue:${s}`, 0, -1)))).flat();
      if (allIds.length === 0) return [];
      const tasks = await this.redis.mget(allIds.map(id => `${this.storageName}:task:${id}`));
      return tasks.filter(Boolean).map(t => JSON.parse(t!));
    } else {
      const ids = await this.redis.lrange(`${this.storageName}:queue:${status}`, 0, -1);
      if (ids.length === 0) return [];
      const tasks = await this.redis.mget(ids.map((id: string) => `${this.storageName}:task:${id}`));
      return tasks.filter(Boolean).map(t => JSON.parse(t!));
    }
  }

  // Save tasks: Not used in Redis as we update individual tasks
  async saveTasks(_tasks: Task<HandlerMap>[], _status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    // No-op or throw error to indicate misuse
    throw new Error('saveTasks is not supported in RedisQueueRepository. Use updateTask or enqueue.');
  }

  // Enqueue: Add task hash and push ID to pending queue
  async enqueue(task: Task<HandlerMap>): Promise<void> {
    const taskKey = `${this.storageName}:task:${task.id}`;
    await this.redis
      .multi()
      .set(taskKey, JSON.stringify(task))
      .rpush(`${this.storageName}:queue:pending`, task.id.toString())
      // .zadd(`${this.storageName}:queue:pending`, task.priority || 0, task.id.toString())
      .exec();
  }

  // Update a single task atomically
  override async updateTask(id: string, obj: Partial<Task<HandlerMap>>): Promise<Task<HandlerMap> | undefined> {
    const taskKey = `${this.storageName}:task:${id}`;
    const taskStr = await this.redis.get(taskKey);
    if (!taskStr) return undefined;
    const task = JSON.parse(taskStr) as Task<HandlerMap>;
    const taskStatus = task.status;
    Object.assign(task, obj);
    task.updatedAt = new Date();
    await this.redis.set(taskKey, JSON.stringify(task));
    // If status changed, move the ID between status queues
    if (obj.status && obj.status !== taskStatus) {
      await this.redis
        .multi()
        .lrem(`${this.storageName}:queue:${taskStatus}`, 0, id.toString())
        .rpush(`${this.storageName}:queue:${obj.status}`, id.toString())
        .exec();
    }
    return task;
  }

  // Dequeue: Atomically move task from pending to processing
  override async dequeue(): Promise<Task<HandlerMap> | null> {
    if (this.dequeueLock) return null;
    this.dequeueLock = true;

    try {
      // Get all pending tasks and sort them
      const tasks = await this.loadTasks('pending');
      const taskToProcess = [...tasks].sort(this.sortTasksToDequeue)[0];

      if (!taskToProcess) {
        const processingTasks = await this.loadTasks('processing');
        await this.checkAndHandleStuckTasks(processingTasks);
        return null;
      }

      const taskKey = `${this.storageName}:task:${taskToProcess.id}`;
      const pendingQueueKey = `${this.storageName}:queue:pending`;
      const processingQueueKey = `${this.storageName}:queue:processing`;

      // Update task status
      taskToProcess.status = 'processing';
      taskToProcess.updatedAt = new Date();

      // Atomically:
      // 1. Remove from pending queue
      // 2. Add to processing queue
      // 3. Update task data
      await this.redis
        .multi()
        .lrem(pendingQueueKey, 0, taskToProcess.id.toString())
        .rpush(processingQueueKey, taskToProcess.id.toString())
        .set(taskKey, JSON.stringify(taskToProcess))
        .exec();

      return taskToProcess;
    } finally {
      this.dequeueLock = false;
    }
  }
}
