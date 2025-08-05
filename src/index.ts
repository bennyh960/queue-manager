import JsonQueue, { type Task } from './lib/jsonQueue.js';
import { FileQueueRepository } from './lib/repositories/file.repository.js';
import { resizeImage, sendEmail, type HandlerMap } from './methods.js';

// const fileRepo = new FileQueueRepository<Task<HandlerMap>>('./tasks2.json');

const run = async () => {
  // const queue = JsonQueue.getInstance<HandlerMap>({ backend: { type: 'file', filePath: './tasks2.json' } });
  const queue = JsonQueue.getInstance<HandlerMap>({ backend: { type: 'file', filePath: './data/tasks2.json' } });

  queue.register('sendEmail', sendEmail);
  queue.register('resizeImage', resizeImage);

  // await queue.addTaskToQueue('sendEmail', { email: 'sda@sc.com' });
  // await queue.addTaskToQueue('sendEmail', { email: 'ben2@sc.com' });
  // await queue.addTaskToQueue('resizeImage', { imageUrl: 'http://example.com/image.jpg' });

  queue.queueWorker();
};

run();
