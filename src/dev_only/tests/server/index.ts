import express from 'express';
import { QueueManager } from '../../../lib/QueueManager';
import { HandlerMap, Task } from '../../../types';

const app = express();
app.use(express.json());

const serverRun = async (queue: QueueManager<HandlerMap>) => {
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

export default serverRun;
