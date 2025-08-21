// serverRun(queue);

import { Redis } from 'ioredis';
import { QueueManager } from './index.js';

const redisClient = new Redis({
  host: 'localhost',
  port: 6380, //docker
});

const processedTasks: string[] = [];
const processingOrder: string[] = [];

const raceHandler = async ({ email, subject }: { email: string; subject: string }) => {
  console.log('🚀 Handler called with:', { email, subject });
  processingOrder.push(`start-${email}`);
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  processedTasks.push(email);
  processingOrder.push(`end-${email}`);
  return `Processed ${email}`;
};

const storageKey = 'test-1';

const testRaceCondtions = async () => {
  const qm1 = QueueManager.getInstance({
    backend: { type: 'redis', redisClient, options: { storageName: storageKey, useLockKey: true } },
    delay: 10000,
    singleton: false,
    logger: console,
  });

  const qm2 = QueueManager.getInstance({
    backend: { type: 'redis', redisClient, options: { storageName: storageKey, useLockKey: true } },
    delay: 10000,
    singleton: false,
    logger: console,
  });

  // Register handlers
  qm1.register('emailHandler', raceHandler, { useAutoSchema: true });
  qm2.register('emailHandler', raceHandler, { useAutoSchema: true });

  // Add tasks
  for (let i = 0; i < 5; i++) {
    const task = await qm1.addTaskToQueue('emailHandler', {
      email: `task-${i}@test.com`,
      subject: `Subject ${i}`,
    });
  }

  // Start workers
  console.log('🏃 Starting both workers...');
  await Promise.all([qm1.startWorker(), qm2.startWorker()]);

  // Wait and check Redis during processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('🔍 Checking Redis during processing...');
  const keysDuringProcess = await redisClient.keys(`${storageKey}*`);
  console.log('📝 Redis keys during processing:', keysDuringProcess);

  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('📊 Final processedTasks:', processedTasks);
  console.log('📊 Processing order:', processingOrder);

  await Promise.all([qm1.stopWorker(), qm2.stopWorker()]);
};

testRaceCondtions();
