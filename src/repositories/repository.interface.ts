export interface QueueRepository<T> {
  loadTasks(): Promise<T[]>;
  saveTasks(tasks: T[]): Promise<T[]>;
  dequeue?(): Promise<T | null>;
}
