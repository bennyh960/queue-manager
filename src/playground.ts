// serverRun(queue);

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import QueueManager from './lib/QueueManager.js';

// const pgPool = new Pool({
//   host: 'localhost',
//   port: 5432,
//   user: 'postgres',
//   password: '123456',
//   database: 'queue_manager',
// });

const redisClient = new Redis({ host: 'localhost', port: 6380 });

const queue = QueueManager.getInstance({
  backend: {
    type: 'redis',
    redisClient: redisClient,
    options: { storageName: 'test-customProps' },
    // type: 'file',
    // filePath: './data/tasks.json',
    // type: 'postgres',
    // pg: pgPool,
  },
});

// queue.register('test', async payload => {
//   console.log('Processing test task:', payload);
// });

queue.addTaskToQueue('test', { some: 'data' }, undefined, { customProp: 'customValue' });

// queue.startWorker();

const tasks = await queue.getAllTasks();
console.log('All tasks:', tasks);
