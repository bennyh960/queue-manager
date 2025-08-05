import express from 'express';
import JsonQueue, { type Task } from './lib/jsonQueue.js';
import { resizeImage, sendEmail, type HandlerMap } from './methods.js';

const app = express();
app.use(express.json());

const queue = JsonQueue.getInstance<HandlerMap>({ backend: { type: 'file', filePath: './data/tasks2.json' } });
queue.register('sendEmail', sendEmail, { maxRetries: 3, maxProcessingTime: 2000 });
queue.register('resizeImage', resizeImage);
queue.queueWorker();

// Add a task to the queue
app.post('/tasks', async (req, res) => {
  const { fn, params } = queue.getRegisteredHandler(req.body.handler);

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
  res.status(201).json({ message: 'Task added', task });
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
