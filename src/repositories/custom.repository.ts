import type { HandlerMap, Task } from '../types/index.js';
import { TaskSchema } from '../util/task.schema.js';
import { BaseQueueRepository } from './base.repositury.js';
import type { QueueRepository } from './repository.interface.js';

// export class CustomQueueRepository extends BaseQueueRepository implements QueueRepository {
//   private readonly _loadTasks: () => Promise<Task<HandlerMap>[]>;
//   private readonly _saveTasks: (tasks: Task<HandlerMap>[]) => Promise<Task<HandlerMap>[]>;
//   private readonly _dequeue: () => Promise<Task<HandlerMap> | null>;
//   private readonly _enqueue: (task: Task<HandlerMap>) => Promise<void>;
//   private readonly _generateId: () => Promise<number> = () => Promise.resolve(this.nextId++);
//   private nextId = 1;

//   constructor(params: {
//     loadTasks: () => Promise<Task<HandlerMap>[]>;
//     saveTasks: (tasks: Task<HandlerMap>[]) => Promise<Task<HandlerMap>[]>;
//     dequeue: () => Promise<Task<HandlerMap> | null>;
//     enqueue: (task: Task<HandlerMap>) => Promise<void>;
//     generateId: () => Promise<number>;
//   }) {
//     this._loadTasks = params.loadTasks;
//     this._saveTasks = params.saveTasks;
//     this._dequeue = params.dequeue;
//     this._enqueue = params.enqueue;
//     this._generateId = params.generateId;
//   }

//   async generateId(): Promise<number> {
//     return this._generateId();
//   }

//   async enqueue(task: Task<HandlerMap>): Promise<void> {
//     TaskSchema.validateAll(task as any); // Validate the task before enqueueing
//     await this._enqueue(task);
//   }

//   async loadTasks(): Promise<Task<HandlerMap>[]> {
//     const tasks = await this._loadTasks();
//     if (!tasks || !Array.isArray(tasks)) {
//       throw new Error('Invalid tasks loaded from custom repository');
//     }
//     if (tasks[0]) {
//       TaskSchema.validateAll(tasks[0]);
//     }
//     return tasks;
//   }

//   async saveTasks(tasks: Task<HandlerMap>[]): Promise<Task<HandlerMap>[]> {
//     return await this._saveTasks(tasks);
//   }

//   async dequeue(): Promise<Task<HandlerMap> | null> {
//     const task = await this._dequeue();
//     if (task) {
//       TaskSchema.validateAll(task);
//     }
//     return task;
//   }
// }
