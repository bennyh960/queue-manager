export type Task<H extends Record<string, (payload: any) => any>> = {
    id: number;
    handler: keyof H;
    payload: Parameters<H[keyof H]>[0];
    status: 'pending' | 'processing' | 'done' | 'failed';
};
export declare class JsonQueue<H extends Record<string, (payload: any) => any>> {
    private static instance;
    private tasks;
    private nextId;
    private filePath;
    private constructor();
    static getInstance({ filePath }: {
        filePath: string;
    }): JsonQueue<Record<string, (payload: any) => any>>;
    loadTasksFromRepository(): void;
    private saveTasks;
    addTaskToQueue(payload: any, handler: string): Task<H>;
    dequeue(): Task<H> | undefined;
    getAllTasks(): Task<H>[];
    getTaskById(id: number): Task<H> | undefined;
    updateTaskStatus(id: number, status: 'pending' | 'processing' | 'done' | 'failed'): Task<H> | undefined;
}
export default JsonQueue;
