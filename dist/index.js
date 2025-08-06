// import QueueManager, { type Task } from './lib/QueueManager.js';
// import { FileQueueRepository } from './lib/repositories/file.repository.js';
// import { resizeImage, sendEmail, type HandlerMap } from './methods.js';
export {};
// // const fileRepo = new FileQueueRepository<Task<HandlerMap>>('./tasks2.json');
// const run = async () => {
//   const queue = QueueManager.getInstance<HandlerMap>({ backend: { type: 'file', filePath: './data/tasks2.json' } });
//   queue.register('sendEmail', sendEmail);
//   queue.register('resizeImage', resizeImage);
//   await queue.addTaskToQueue('sendEmail', { email: 'sda@sc.com' });
//   await queue.addTaskToQueue('sendEmail', { email: 'ben2@sc.com' });
//   await queue.addTaskToQueue('resizeImage', { imageUrl: 'http://example.com/image.jpg' });
//   queue.startWorker();
// };
// run();
//# sourceMappingURL=index.js.map