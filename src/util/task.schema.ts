import { MiniSchema as M } from '../util/schema.util.js';

export const TaskSchema = M.object({
  id: M.number(),
  handler: M.string(),
  payload: M.objectAny(),
  status: M.enum(['pending', 'processing', 'done', 'failed', 'deleted']),
  log: M.string().default(''),
  createdAt: M.union([M.date(), M.string()]).default(new Date()),
  updatedAt: M.union([M.date(), M.string()]).default(new Date()),
  maxRetries: M.number().default(10).optional(),
  maxProcessingTime: M.number().default(5000),
  retryCount: M.number().default(0),
  priority: M.number().default(0),
});
