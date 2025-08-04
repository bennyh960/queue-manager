import { JsonQueue } from './lib/index.js';
import { resizeImage, sendEmail } from './methods.js';

type HandlerMap = {
  sendEmail: (payload: { email: string }) => Promise<void>;
  resizeImage: (payload: { imageUrl: string }) => Promise<void>;
};

const queue = JsonQueue.getInstance<HandlerMap>({ filePath: './tasks.json' });

queue.register('sendEmail', sendEmail);
queue.register('resizeImage', resizeImage);

queue.addTaskToQueue('sendEmail', { email: 'sda@sc.com' });
queue.addTaskToQueue('sendEmail', { email: 'ben2@sc.com' });
queue.addTaskToQueue('resizeImage', {
  imageUrl: 'http://example.com/image.jpg',
});

queue.queueWorker();
