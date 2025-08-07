import express from 'express';
import QueueManager from './lib/QueueManager.js';
import type { Task } from './types/index.js';
import { CustomQueueRepository } from './repositories/custom.repository.js';

export async function sendEmail({ email }: { email: string }) {
  if (!email) {
    throw new Error('Email is required');
  }
  console.log(`Sending email to ${email}...`);
  await new Promise(res => setTimeout(res, 3000));
  console.log(`Email sent to ${email}`);
}

export async function resizeImage({ imageUrl }: { imageUrl: string }) {
  console.log(`Resizing image ${imageUrl}...`);
  await new Promise(res => setTimeout(res, 1500));
  console.log(`Image resized: ${imageUrl}`);
}

export type HandlerMap = {
  sendEmail: ({ email }: { email: string }) => Promise<void>;
  resizeImage: ({ imageUrl }: { imageUrl: string }) => Promise<void>;
};

const app = express();
app.use(express.json());

const dbRepo = new CustomQueueRepository({
  loadTasks: async () => {
    return [];
  },
  saveTasks: async (tasks: any[]) => tasks,
  dequeue: async () => null,
});

const queue = QueueManager.getInstance<HandlerMap>({ backend: { type: 'custom', repository: dbRepo }, processType: 'single' });
// const queue = QueueManager.getInstance<HandlerMap>({ backend: { type: 'file', filePath: './data/tasks2.json' }, processType: 'single' });
queue.register('sendEmail', sendEmail, { maxRetries: 3, maxProcessingTime: 2000 });
queue.register('resizeImage', resizeImage);
queue.startWorker();

// Add a task to the queue
app.post('/tasks', async (req, res) => {
  const { fn, params } = queue.inspectHandler(req.body.handler);

  if (!fn) {
    return res.status(400).json({ message: `Handler ${req.body.handler} is not registered` });
  }
  if (!req.body.payload) {
    return res.status(400).json({ message: 'Payload is required' });
  }
  for (const key of params || []) {
    const isValid = req.body.payload.hasOwnProperty(key);
    if (!isValid) {
      return res.status(400).json({ message: `Payload is missing required parameter: ${key}` });
    }
  }

  const task = await queue.addTaskToQueue(req.body.handler, req.body.payload, { maxRetries: 3, maxProcessingTime: 2000 });
  res.status(201).json({ message: 'Task added', task });
});
app.get('/task/:id', (req, res) => {
  const id = req.params.id;
  const task = queue.getTaskById(parseInt(id));
  res.status(201).json({ message: task ? 'Task found' : 'Task not found', task });
});
app.delete('/task/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const task = await queue.removeTask(parseInt(id));
    res.status(200).json({ message: 'Task removed', task });
  } catch (error) {
    res.status(404).json({ message: String(error) });
  }
});

app.get('/tasks', async (req, res) => {
  const { status, from, to } = req.query;
  const tasks = queue.getAllTasks();
  if (!tasks) {
    return res.status(404).json({ message: 'No tasks found', total: 0, tasks: [] });
  }
  const filteredTasks: Task<HandlerMap>[] = tasks.filter(task => {
    return (
      (status ? task.status === status : true) &&
      (from && typeof from === 'string' ? new Date(task.createdAt) >= new Date(from) : true) &&
      (to && typeof to === 'string' ? new Date(task.createdAt) <= new Date(to) : true)
    );
  });
  res.status(200).json({ message: 'Tasks retrieved', total: filteredTasks.length, tasks: filteredTasks });
});

app.post('/task/update', async (req, res) => {
  const { id, status, log } = req.body;
  if (!id || !status) {
    return res.status(400).json({ message: 'Task ID and status are required' });
  }

  const taskId = parseInt(id);
  if (isNaN(taskId)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  if (!['pending', 'completed', 'failed'].includes(status)) {
    const commonMessage = `you can only change status to 'pending', 'completed' or 'failed'`;
    const message =
      status === 'processing' ? `change status to processing is not allowed ,${commonMessage}` : `invalid status: ${commonMessage}`;
    return res.status(400).json({ message });
  }

  const existingTask = queue.getTaskById(taskId);
  if (!existingTask) {
    return res.status(404).json({ message: 'Task not found' });
  }
  if (existingTask.status === status) {
    return res.status(400).json({ message: 'Task status is already set to the requested status', task: existingTask });
  }

  const task = await queue.updateTaskStatus(taskId, status, log ?? `status updated manually`);
  if (task) {
    res.status(200).json({ message: 'Task updated', task });
  } else {
    res.status(404).json({ message: 'Task not found' });
  }
});

app.listen(3000, () => {
  console.log('Queue server running on http://localhost:3000');
});

queue.on('taskAdded', task => {
  console.log(`Task added: ${task.id} - ${task.handler}`);
});

queue.on('taskStarted', task => {
  console.log(`Task started: ${task.id} - ${task.handler}`);
});

queue.on('taskCompleted', task => {
  console.log(`Task completed: ${task.id} - ${task.handler}`);
});

queue.on('taskFailed', (task, error) => {
  console.error(`Task failed: ${task.id} - ${task.handler}`, error);
});

queue.on('taskRetried', task => {
  console.log(`Task retried: ${task.id} - ${task.handler}`);
});

queue.on('taskRemoved', task => {
  console.log(`Task removed: ${task.id} - ${task.handler}`);
});

queue.on('taskStuck', task => {
  console.warn(`Task stuck: ${task.id} - ${task.handler}`);
});
