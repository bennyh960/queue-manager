import type { HandlerMap, Task } from '../types/index.js';

export const sortTasksByPriority = (a: Task<HandlerMap>, b: Task<HandlerMap>): number => {
  return (b.priority ?? 0) - (a.priority ?? 0) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};
