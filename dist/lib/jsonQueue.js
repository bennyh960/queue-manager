import fs from 'fs';
export class JsonQueue {
    static instance;
    tasks = [];
    nextId = 1;
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
        this.loadTasksFromRepository();
    }
    static getInstance({ filePath }) {
        if (!JsonQueue.instance) {
            JsonQueue.instance = new JsonQueue(filePath);
        }
        return JsonQueue.instance;
    }
    loadTasksFromRepository() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                this.tasks = JSON.parse(data);
                this.nextId =
                    this.tasks.length > 0
                        ? Math.max(...this.tasks.map(t => t.id)) + 1
                        : 1;
            }
            else {
                // this.tasks = [];
                throw new Error('path does not exist, initializing with empty tasks array');
            }
        }
        catch (error) {
            console.error('Error loading tasks from repository:', error);
            // this.tasks = [];
        }
    }
    saveTasks() {
        fs.writeFileSync(this.filePath, JSON.stringify(this.tasks, null, 2));
    }
    addTaskToQueue(payload, handler) {
        const task = {
            id: this.nextId++,
            payload,
            handler,
            status: 'pending',
        };
        this.tasks.push(task);
        this.saveTasks();
        return task;
    }
    dequeue() {
        const task = this.tasks.find(t => t.status === 'pending');
        if (task) {
            task.status = 'processing';
            return task;
        }
        return undefined;
    }
    getAllTasks() {
        return this.tasks;
    }
    getTaskById(id) {
        return this.tasks.find(task => task.id === id);
    }
    updateTaskStatus(id, status) {
        const task = this.getTaskById(id);
        if (task) {
            task.status = status;
            this.saveTasks();
            return task;
        }
        return undefined;
    }
}
export default JsonQueue;
//# sourceMappingURL=jsonQueue.js.map