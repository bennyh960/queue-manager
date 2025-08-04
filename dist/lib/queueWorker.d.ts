import type { HandlerRegistry } from './handlerRegistry.js';
import type { JsonQueue } from './jsonQueue.js';
declare function queueWorker<H extends Record<string, (payload: any) => Promise<void>>>(queue: JsonQueue<H>, registry: HandlerRegistry<H>): Promise<void>;
export default queueWorker;
