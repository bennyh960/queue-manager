import { HandlerRegistry, JsonQueue, queueWorker } from './lib/index.js';
import { resizeImage, sendEmail } from './methods.js';
const registry = new HandlerRegistry();
registry.register('sendEmail', sendEmail);
registry.register('resizeImage', resizeImage);
const queue = JsonQueue.getInstance({ filePath: './tasks.json' });
queue.addTaskToQueue({ email: 'ben@sc.com' }, 'sendEmail');
queue.addTaskToQueue({ email: 'ben2@sc.com' }, 'sendEmail');
queue.addTaskToQueue({ imageUrl: 'http://example.com/image.jpg' }, 'resizeImage');
queueWorker(queue, registry);
//# sourceMappingURL=index.js.map