import fs from 'fs';
import { HandlerRegistry } from './handlerRegistry.js';

export type Task<H extends Record<string, (payload: any) => any>> = {
  id: number;
  handler: keyof H;
  payload: Parameters<H[keyof H]>[0];
  status: 'pending' | 'processing' | 'done' | 'failed';
  log: string;
};

const singletonRegistry = new HandlerRegistry();

export class JsonQueue<H extends Record<string, (payload: any) => any>> {
  private static instance: JsonQueue<Record<string, (payload: any) => any>>;
  private tasks: Task<H>[] = [];
  private nextId = 1;
  private filePath: string;
  private delay: number;
  private registry: HandlerRegistry<Record<string, (payload: any) => any>>;

  private constructor(filePath: string, delay: number = 500) {
    this.filePath = filePath;
    this.loadTasksFromRepository();
    this.delay = delay;
    this.registry = singletonRegistry;
  }

  public static getInstance<
    H extends Record<string, (payload: any) => any>
  >(args: { filePath: string }): JsonQueue<H> {
    if (!JsonQueue.instance) {
      JsonQueue.instance = new JsonQueue(args.filePath);
    }
    return JsonQueue.instance as JsonQueue<H>;
  }

  loadTasksFromRepository(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8') || '[]';
        this.tasks = JSON.parse(data);
        this.nextId =
          this.tasks.length > 0
            ? Math.max(...this.tasks.map(t => t.id)) + 1
            : 1;
      } else {
        this.tasks = [];
      }
    } catch (error) {
      // If the file is empty or malformed, start with an empty queue
      console.log(
        'Error loading tasks from repository: initialize new tasks lists',
        error
      );
      this.tasks = [];
    }
  }

  private saveTasks() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.tasks, null, 2));
  }

  addTaskToQueue<K extends keyof H>(
    handler: K,
    payload: Parameters<H[K]>[0]
  ): Task<H> {
    const task: Task<H> = {
      id: this.nextId++,
      payload,
      handler,
      status: 'pending',
      log: '',
    };
    this.tasks.push(task);
    this.saveTasks();
    return task;
  }

  dequeue(): Task<H> | undefined {
    const task = this.tasks.find(t => t.status === 'pending');
    if (task) {
      task.status = 'processing';
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

  updateTaskStatus(
    id: number,
    status: 'pending' | 'processing' | 'done' | 'failed',
    log?: string
  ): Task<H> | undefined {
    const task = this.getTaskById(id);
    if (task) {
      task.status = status;
      if (log) {
        task.log = log;
      }
      this.saveTasks();
      return task;
    }
    return undefined;
  }

  async queueWorker() {
    const queue = JsonQueue.getInstance({
      filePath: this.filePath,
    });

    while (true) {
      const task = queue.dequeue();
      if (!task) {
        await new Promise(res => setTimeout(res, queue.delay));
        continue;
      }
      try {
        const handler = this.registry.get(task.handler as string);
        if (!handler) throw new Error('Handler not found');
        await handler(task.payload);
        queue.updateTaskStatus(task.id, 'done');
      } catch (err: any) {
        console.error(`Task ${task.id} failed:`, err);
        const log = err?.message?.toString() || 'Unknown error';
        queue.updateTaskStatus(task.id, 'failed', log);
      }
    }
  }

  register<K extends string, F extends (payload: any) => any>(
    name: K,
    handler: F
  ) {
    this.registry.register(name, handler);
  }
}

export default JsonQueue;
