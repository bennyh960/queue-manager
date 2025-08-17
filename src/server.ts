import type { Task } from './types/index.js';
import { Redis } from 'ioredis'; // ✅ This works with CommonJS-style exports
import { DefaultLogger } from './dev_only/logger.js';
import PG from 'pg';
import { fakeMethods, type HandlerMapFakeMethods } from './dev_only/fake.methods.js';
import { MiniSchema as M, ValidationError } from './dev_only/schema.util.js';
import { FileRepositoryReadError, TaskMaxRetriesExceededError } from './util/errors.js';
import { QueueManager } from './index.js';

// persistence connection
const pool = new PG.Pool({ password: '123456', user: 'postgres', host: 'localhost', database: 'queue_manager', port: 5432 });
// const redis = new Redis({ host: 'localhost', port: 6380 });

// init queue manager
const queue = QueueManager.getInstance<HandlerMapFakeMethods>({
  backend: { type: 'postgres', pg: pool, options: { schema: 'public', tableName: 'tasks' } },
  // backend: { type: 'file', filePath: 'data/tasks.json' },
  logger: new DefaultLogger(),
  crashOnWorkerError: false,
  delay: 100,
});

// register methods
queue.register('doSomething', fakeMethods.doSomething);
queue.register('doSomethingWithError', fakeMethods.doSomethingWithError);
queue.register('sendEmail', fakeMethods.sendEmail, {
  maxRetries: 3,

  // maxProcessingTime: 2000,
  useAutoSchema: true,
  paramSchema: payload => {
    try {
      const EmailSchema = M.object({
        email: M.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'),
      });

      EmailSchema.validateAll(payload);

      return { isValid: true, message: null };
    } catch (error: any) {
      const errors = error instanceof ValidationError ? error.errors : [{ path: 'unknown', message: JSON.stringify(error) }];

      return {
        isValid: false,
        message: errors.map(e => e.message).join(', '),
      };
    }
  },
});

queue.register('resizeImage', fakeMethods.resizeImage, {
  paramSchema: payload => {
    if (!payload.imageUrl) {
      return { isValid: false, message: 'imageUrl is required', source: 'param-schema' };
    }
    const isValid = typeof payload.imageUrl === 'string';
    return { isValid, message: isValid ? null : 'Invalid imageUrl' };
  },
});

// adding tasks to the queue
await queue.addTaskToQueue('sendEmail', { email: 'test1@example.com' }, { priority: 3 });
// await queue.addTaskToQueue('resizeImage', { imageUrl: 'http://example.com/image.jpg' }, { priority: 2 });
// await queue.addTaskToQueue('doSomething', undefined, { priority: 1 });
await queue.addTaskToQueue('doSomethingWithError', undefined, { priority: 1 });
await queue.addTaskToQueue('sendEmail', { email: 'test3@example.com' }, { priority: 0 });

queue.startWorker();
