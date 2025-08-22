// serverRun(queue);

import { Pool } from 'pg';
import QueueManager from './lib/QueueManager.js';

const pgPool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '123456',
  database: 'queue_manager',
});

const queue = QueueManager.getInstance({
  backend: {
    type: 'postgres',
    pg: pgPool,
  },
});

queue.startWorker();
