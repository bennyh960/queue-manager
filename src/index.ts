export { QueueManager } from './lib/QueueManager.js';

export { type QueueRepository } from './repositories/repository.interface.js';
export { FileQueueRepository } from './repositories/file.repository.js';
export { MemoryQueueRepository } from './repositories/memory.repository.js';

export { type HandlerMap, type Task, type QueueManagerEvents, type QueueBackendConfig, type LoggerLike } from './types/index.js';

import * as T from './test/redis.example.js';
