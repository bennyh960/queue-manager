import type { HandlerMap, QueueBackendConfig, Task } from '../types/index.js';
import { BaseQueueRepository } from './base.repository.js';
import type { Redis } from 'ioredis';
import crypto from 'crypto';
import { RedisRepositorySaveTasksError } from '../util/errors.js';
import type { QueueRepository } from '../index.js';

export class RedisQueueRepository extends BaseQueueRepository implements QueueRepository {
  private readonly redis: Redis;
  storageName: string;
  useLockKey: boolean;
  private dequeueLockName: string;

  constructor(
    redisClient: Redis,
    maxRetries: number,
    maxProcessingTime: number,
    storageName?: Extract<QueueBackendConfig, { type: 'redis' }>['storageName'],
    useLockKey?: Extract<QueueBackendConfig, { type: 'redis' }>['useLockKey']
  ) {
    super(maxRetries, maxProcessingTime);
    this.redis = redisClient;
    this.storageName = storageName || 'queue-manager';
    this.useLockKey = useLockKey || false;
    this.dequeueLockName = `${this.storageName}:dequeue-lock`;
  }

  async setDequeueLockName(name: string): Promise<void> {
    const newName = `${this.storageName}:${name}`;
    const success = await this.redis.rename(this.dequeueLockName, newName);
    if (!success) {
      throw new Error(`Failed to rename dequeue lock: ${this.dequeueLockName} to ${newName}`);
    }

    this.dequeueLockName = newName;
    this.logger?.info(`Dequeue lock name set to: ${this.dequeueLockName}.`);
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
    throw new RedisRepositorySaveTasksError();
  }

  async deleteTask(id: string, hardDelete?: boolean): Promise<Task<HandlerMap> | undefined> {
    const taskKey = `${this.storageName}:task:${id}`;
    const taskStr = await this.redis.get(taskKey);
    if (!taskStr) return undefined;

    const task = JSON.parse(taskStr) as Task<HandlerMap>;
    if (hardDelete) {
      // Remove from all queues and delete the task
      const multi = this.redis.multi();
      ['pending', 'processing', 'failed', 'completed'].forEach(status => {
        multi.lrem(`${this.storageName}:queue:${status}`, 0, id);
      });
      multi.del(taskKey);
      await multi.exec();
    } else {
      // Soft delete: just update status
      task.status = 'deleted';
      task.updatedAt = new Date();
      await this.redis.set(taskKey, JSON.stringify(task));
    }
    return task;
  }

  getScore(task: Task<HandlerMap>): number {
    const PRIORITY_MULTIPLIER = 1000000; // Large multiplier to prioritize by priority first
    // Calculate score based on priority and createdAt
    // Higher priority first, then older (smaller createdAt)
    return task.priority * PRIORITY_MULTIPLIER - new Date(task.createdAt).getTime();
  }

  // Enqueue: Add task hash and push ID to pending queue
  async enqueue(task: Task<HandlerMap>): Promise<void> {
    const score = this.getScore(task);
    const taskKey = `${this.storageName}:task:${task.id}`;
    await this.redis
      .multi()
      .set(taskKey, JSON.stringify(task))
      .zadd(`${this.storageName}:queue:pending`, score, task.id)
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

  private async acquireLock(ttl: number): Promise<boolean> {
    // for single process its enough
    if (this.dequeueLock) return false;

    // for multi process we use redis lock
    if (this.useLockKey) {
      const uuid = crypto.randomUUID();
      const result = await this.redis.set(this.dequeueLockName, uuid, 'PX', ttl, 'NX');
      return result === 'OK';
    }
    this.dequeueLock = true;
    return true;
  }

  private async releaseLock(): Promise<void> {
    this.dequeueLock = false;
    if (this.useLockKey) {
      await this.redis.del(this.dequeueLockName);
    }
  }

  // Dequeue: Atomically move task from pending to processing
  override async dequeue(): Promise<Task<HandlerMap> | null> {
    try {
      // Get all pending tasks and sort them
      const [taskId] = await this.redis.zrevrange(`${this.storageName}:queue:pending`, 0, 0);
      if (!taskId) {
        const processingTasks = await this.loadTasks('processing');
        await this.checkAndHandleStuckTasks(processingTasks);
        return null;
      }

      const taskStr = await this.redis.get(`${this.storageName}:queue:task:${taskId}`);
      const taskToProcess = taskStr ? (JSON.parse(taskStr) as Task<HandlerMap>) : null;
      if (!taskToProcess) {
        return null; // Task not found
      }

      const isLocked = await this.acquireLock(taskToProcess.maxProcessingTime * taskToProcess.maxRetries + 1000);
      if (!isLocked) {
        return null;
      }

      // Update task status
      taskToProcess.status = 'processing';
      taskToProcess.updatedAt = new Date();

      const taskKey = `${this.storageName}:task:${taskId}`;
      const pendingQueueKey = `${this.storageName}:queue:pending`;
      const processingQueueKey = `${this.storageName}:queue:processing`;

      await this.redis
        .multi()
        .zrem(pendingQueueKey, taskId)
        .rpush(processingQueueKey, taskId)
        .set(taskKey, JSON.stringify(taskToProcess))
        .exec();

      return taskToProcess;
    } finally {
      await this.releaseLock();
    }
  }
}
