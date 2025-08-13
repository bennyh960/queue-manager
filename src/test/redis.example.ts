import { Redis } from 'ioredis'; // ✅ This works with CommonJS-style exports

const redis = new Redis({ host: 'localhost', port: 6379 });

const task = { id: 2, handler: 'exampleHandler2' };

async function pushTAsk(task: any) {
  const res = await redis.rpush('pending', JSON.stringify(task));

  console.log(res); // Should print: Hello, Redis!
  redis.disconnect();
}

// pushTAsk(task).catch(console.error);

async function dequeueTask() {
  const task = await redis.lpop('pending');
  if (task) {
    console.log(`Dequeued task: ${task}`);
  } else {
    console.log('No tasks in the queue');
  }
  redis.disconnect();
}

dequeueTask().catch(console.error);
