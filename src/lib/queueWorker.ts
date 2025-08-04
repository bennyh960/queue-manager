import type { HandlerRegistry } from './handlerRegistry.js';
import type { JsonQueue } from './jsonQueue.js';

async function queueWorker<
  H extends Record<string, (payload: any) => Promise<void>>
>(queue: JsonQueue<H>, registry: HandlerRegistry<H>) {
  while (true) {
    const task = queue.dequeue();
    if (!task) {
      await new Promise(res => setTimeout(res, 500));
      continue;
    }
    try {
      const handler = registry.get(task.handler);
      if (!handler) throw new Error('Handler not found');
      await handler(task.payload);
      queue.updateTaskStatus(task.id, 'done');
    } catch (err) {
      console.error(`Task ${task.id} failed:`, err);
      queue.updateTaskStatus(task.id, 'failed');
    }
  }
}

export default queueWorker;
