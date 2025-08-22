import type { HandlerMap, QueueBackendConfig, Task } from '../types/index.js';
import { BaseQueueRepository } from './base.repository.js';
import type { Redis } from 'ioredis';
import crypto from 'crypto';
import { RedisRepositorySaveTasksError } from '../util/errors.js';
import type { QueueRepository } from '../index.js';

export class RedisQueueRepository extends BaseQueueRepository implements QueueRepository {
  private readonly redis: Redis;
  storageName: string;
  private dequeueLockName: string;

  constructor(
    redisClient: Redis,
    maxRetries: number,
    maxProcessingTime: number,

    options?: Extract<QueueBackendConfig, { type: 'redis' }>['options']
  ) {
    super(maxRetries, maxProcessingTime);
    this.redis = redisClient;
    this.storageName = options?.storageName || 'queue-manager';
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
      const allIds = (await Promise.all(statuses.map(s => this.redis.zrange(`${this.storageName}:queue:${s}`, 0, -1)))).flat();
      if (allIds.length === 0) return [];
      const tasks = await this.redis.mget(allIds.map(id => `${this.storageName}:task:${id}`));
      return tasks.filter(Boolean).map(t => JSON.parse(t!));
    } else {
      const ids = await this.redis.zrange(`${this.storageName}:queue:${status}`, 0, -1);
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
        multi.zrem(`${this.storageName}:queue:${status}`, id);
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
    await this.redis.multi().set(taskKey, JSON.stringify(task)).zadd(`${this.storageName}:queue:pending`, score, task.id).exec();
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
      const score = this.getScore(task);
      await this.redis
        .multi()
        .zrem(`${this.storageName}:queue:${taskStatus}`, id.toString())
        .zadd(`${this.storageName}:queue:${obj.status}`, score, id.toString())
        .exec();
    }
    return task;
  }

  private ATOMIC_DEQUEUE_LUA = `local pending_key = KEYS[1]
local processing_key = KEYS[2]
local task_prefix = ARGV[1]

-- Get the highest-priority task ID
local task_id = redis.call('zrevrange', pending_key, 0, 0)[1]
if not task_id then
  return nil
end

-- Remove from pending
redis.call('zrem', pending_key, task_id)

-- Add to processing with score (can reuse score or set to current time)
local score = redis.call('time')[1]
redis.call('zadd', processing_key, score, task_id)

-- Update task status
local task_key = task_prefix .. task_id
local task_json = redis.call('get', task_key)
if not task_json then
  return nil
end
local task = cjson.decode(task_json)
task.status = 'processing'
task.updatedAt = score
redis.call('set', task_key, cjson.encode(task))

return redis.call('get', task_key)`;

  // Dequeue: Atomically move task from pending to processing
  override async dequeue(): Promise<Task<HandlerMap> | null> {
    try {
      const pendingQueueKey = `${this.storageName}:queue:pending`;
      const processingQueueKey = `${this.storageName}:queue:processing`;
      const taskPrefix = `${this.storageName}:task:`;
      if (this.dequeueLock) {
        return null;
      }

      const taskStr = (await this.redis.eval(this.ATOMIC_DEQUEUE_LUA, 2, pendingQueueKey, processingQueueKey, taskPrefix)) as string | null;

      // Get all pending tasks and sort them
      if (!taskStr) {
        const processingTasks = await this.loadTasks('processing');
        await this.checkAndHandleStuckTasks(processingTasks);
        return null;
      } else {
        this.dequeueLock = true;
      }

      const taskToProcess = taskStr ? (JSON.parse(taskStr) as Task<HandlerMap>) : null;
      if (!taskToProcess) {
        return null; // Task not found
      }

      return taskToProcess;
    } finally {
      this.dequeueLock = false;
    }
  }
}
