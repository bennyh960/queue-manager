import QueueManager from '../lib/QueueManager.js';

const queueManager1 = QueueManager.getInstance({
  singleton: false,
  processType: 'single',
  backend: { type: 'file', filePath: 'queue.json' },
});
const queueManager2 = QueueManager.getInstance({
  singleton: false,
  processType: 'single',
  backend: { type: 'file', filePath: 'queue.json' },
});
