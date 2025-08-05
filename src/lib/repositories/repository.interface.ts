export interface QueueRepository<T> {
  loadTasks(): Promise<T[]>;
  saveTasks(tasks: T[]): Promise<void>;
}
