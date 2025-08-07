import type { HandlerMap, Task } from './types/index.js';

export { QueueManager } from './lib/QueueManager.js';

export { type QueueRepository } from './repositories/repository.interface.js';
export { FileQueueRepository } from './repositories/file.repository.js';
export { MemoryQueueRepository } from './repositories/memory.repository.js';

export { type HandlerMap, type Task, type QueueManagerEvents, type QueueBackendConfig, type LoggerLike } from './types/index.js';

// --------------------

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

export type HandlerMap2 = {
  sendEmail: ({ email }: { email: string }) => Promise<void>;
  resizeImage: ({ imageUrl }: { imageUrl: string }) => Promise<void>;
};

const x: Task<HandlerMap2> = {
  id: 1,
  handler: 'sendEmail',
  payload: { email: 'sdas' },
  status: 'pending',
  log: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  retryCount: 0,
  maxRetries: undefined,
  maxProcessingTime: 5000,
  priority: 1,
};
