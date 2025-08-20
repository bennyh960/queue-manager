import type { CustomQueueRepositoryProps, HandlerMap, Task } from '../types/index.js';
import { BaseQueueRepository } from './base.repository.js';
import type { QueueRepository } from './repository.interface.js';

export class CustomQueueRepository extends BaseQueueRepository implements QueueRepository {
  private readonly customProps: CustomQueueRepositoryProps;

  constructor(customProps: CustomQueueRepositoryProps) {
    super(customProps.MAX_RETRIES, customProps.MAX_PROCESSING_TIME);
    this.customProps = customProps;
  }

  async deleteTask(id: string, hardDelete?: boolean): Promise<Task<HandlerMap> | undefined> {
    return this.customProps.deleteTask(id, hardDelete);
  }

  async loadTasks(status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    return this.customProps.loadTasks(status);
  }

  async saveTasks(tasks: Task<HandlerMap>[], _status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    return this.customProps.saveTasks(tasks, _status);
  }

  override async updateTask(id: string, obj: Partial<Task<HandlerMap>>): Promise<Task<HandlerMap> | undefined> {
    return this.customProps.updateTask(id, obj);
  }

  async enqueue(task: Task<HandlerMap>): Promise<void> {
    return this.customProps.enqueue(task);
  }
  override async dequeue(): Promise<Task<HandlerMap> | null> {
    return this.customProps.dequeue();
  }
}
