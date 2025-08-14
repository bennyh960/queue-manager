import express from 'express';
import QueueManager from './lib/QueueManager.js';
import type { Task } from './types/index.js';
import { MiniSchema as M, ValidationError } from './util/schema.util.js';
import { Redis } from 'ioredis'; // ✅ This works with CommonJS-style exports
import { DefaultLogger } from './util/logger.js';

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

function doSomething() {
  console.log('Doing something...');
  // Simulate some processing
  // return new Promise(resolve => setTimeout(resolve, 1000));
}

// const redis = await import('ioredis'); // Ensure ioredis is loaded

// if (!redis) {
//   throw new Error('ioredis is not installed. Please run `npm install ioredis`. if you are using redis backend');
// }

export type HandlerMap = {
  sendEmail: ({ email }: { email: string }) => Promise<void>;
  resizeImage: ({ imageUrl }: { imageUrl: string }) => Promise<void>;
  doSomething: () => void;
};

const app = express();
app.use(express.json());

const queueAsync = async () => {
  const redis = new Redis({ host: 'localhost', port: 6380 });
  const queue = QueueManager.getInstance<HandlerMap>({
    backend: { type: 'redis', redisClient: redis, storageName: 'my-queue2' },
    logger: new DefaultLogger(),
  });

  queue.register('doSomething', doSomething);
  queue.register('sendEmail', sendEmail, {
    maxRetries: 3,
    maxProcessingTime: 2000,
    useAutoSchema: true,
    paramSchema: payload => {
      try {
        const EmailSchema = M.object({
          email: M.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'),
        });

        EmailSchema.validateAll(payload);

        return { isValid: true, message: null, source: 'auto-schema' };
      } catch (error: any) {
        const errors = error instanceof ValidationError ? error.errors : [{ path: 'unknown', message: JSON.stringify(error) }];

        return {
          isValid: false,
          message: errors.map(e => e.message).join(', '),
          source: 'auto-schema',
        };
      }
    },
  });

  queue.register('resizeImage', resizeImage, {
    paramSchema: payload => {
      if (!payload.imageUrl) {
        return { isValid: false, message: 'imageUrl is required', source: 'param-schema' };
      }
      const isValid = typeof payload.imageUrl === 'string';
      return { isValid, message: isValid ? null : 'Invalid imageUrl' };
    },
  });

  await queue.addTaskToQueue('sendEmail', { email: 'test1@example.com' }, { priority: 1 });
  await queue.addTaskToQueue('sendEmail', { email: 'test3@example.com' }, { priority: 3 });
  await queue.addTaskToQueue('sendEmail', { email: 'test9@example.com' }, { priority: 9 });
  await queue.addTaskToQueue('resizeImage', { imageUrl: 'http://example.com/image.jpg' }, { priority: 10 });
  queue.startWorker();

  return queue;
};

const run = async () => {
  const queue = await queueAsync();

  // Add a task to the queue
  app.post('/tasks', async (req, res) => {
    const { isValid, message, source } = queue.validateHandlerParams(req.body.handler, req.body.payload);

    if (!isValid) {
      return res.status(400).json({ message, source });
    }

    // queue.addTaskToQueue("resizeImage",{imageUrl:""})
    const task = await queue.addTaskToQueue(req.body.handler, req.body.payload, { maxRetries: 3, maxProcessingTime: 2000 });
    res.status(201).json({ message: 'Task added', task });
  });
  app.get('/task/:id', async (req, res) => {
    const id = req.params.id;
    const task = await queue.getTaskById(id);
    res.status(201).json({ message: task ? 'Task found' : 'Task not found', task });
  });
  // app.delete('/task/:id', async (req, res) => {
  //   try {
  //     const id = req.params.id;
  //     const task = await queue.removeTask(parseInt(id));
  //     res.status(200).json({ message: 'Task removed', task });
  //   } catch (error) {
  //     res.status(404).json({ message: String(error) });
  //   }
  // });

  app.get('/tasks', async (req, res) => {
    const { status, from, to } = req.query;
    const tasks = await queue.getAllTasks();
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

  app.post('/worker', async (req, res) => {
    const { action, concurrency } = req.body;

    if (action === 'start') {
      await queue.startWorker(concurrency);
      res.status(200).json({ message: 'Worker started' });
    } else if (action === 'stop') {
      await queue.stopWorker();
      res.status(200).json({ message: 'Worker stopped' });
    } else {
      res.status(400).json({ message: 'Invalid action' });
    }
  });

  app.post('/task/update', async (req, res) => {
    const { id, status, log } = req.body;
    if (!id || !status) {
      return res.status(400).json({ message: 'Task ID and status are required' });
    }

    if (!['pending', 'completed', 'failed'].includes(status)) {
      const commonMessage = `you can only change status to 'pending', 'completed' or 'failed'`;
      const message =
        status === 'processing' ? `change status to processing is not allowed ,${commonMessage}` : `invalid status: ${commonMessage}`;
      return res.status(400).json({ message });
    }

    const existingTask = await queue.getTaskById(id);
    if (!existingTask) {
      return res.status(404).json({ message: 'Task not found' });
    }
    if (existingTask.status === status) {
      return res.status(400).json({ message: 'Task status is already set to the requested status', task: existingTask });
    }

    const task = await queue.updateTask(id, { status, log: log ?? `status updated manually` });
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
};
// run();
queueAsync();
