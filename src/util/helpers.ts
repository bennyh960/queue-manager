import type { HandlerMap, Task } from '../types/index.js';

export const sortTasksByPriority = (a: Task<HandlerMap>, b: Task<HandlerMap>): number => {
  return (b.priority ?? 0) - (a.priority ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};

export const dynamicallyImportRedis = () => {
  try {
    const Redis = require('ioredis');
    return Redis;
  } catch {
    throw new Error('ioredis is not installed. Please run `npm install ioredis` if you are using redis backend');
  }
};
