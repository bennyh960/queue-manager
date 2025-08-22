import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { QueueManager } from '../../../lib/QueueManager.js';
import { Redis } from 'ioredis';
import { resetFileContentMethod, testsFileRelPath } from './constants.helpers.js';

// npm test src/dev_only/tests/jest/queue.failure.scenarios.test.ts

// Test handlers with different failure scenarios
type TestHandlers = {
  emailHandler: (payload: { email: string; subject: string }) => Promise<string>;
  schemaHandler: (payload: { requiredField: string; optionalField?: number }) => Promise<void>;
  slowHandler: (payload: { data: string }) => Promise<string>;
  memoryLeakHandler: (payload: { size: number }) => Promise<void>;
  errorHandler: (payload: any) => Promise<never>;
};

describe('QueueManager - Failure Scenarios & Edge Cases', () => {
  let redisClient: Redis | null = null;
  let storageKey: string;

  beforeAll(async () => {
    // Try to connect to Redis for distributed tests
    try {
      redisClient = new Redis({
        host: 'localhost',
        port: 6380, //docker
      });
      await redisClient.ping();
    } catch (error) {
      console.warn('Redis not available, skipping Redis-specific failure tests');
      redisClient?.disconnect();
      redisClient = null;
    }
  });

  beforeEach(() => {
    storageKey = `test-queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  });

  afterEach(async () => {
    await resetFileContentMethod();
  });

  afterAll(async () => {
    if (redisClient) {
      await redisClient.disconnect();
    }
  });

  describe('Concurrency Failure Scenarios', () => {
    const tasksCount = 15;
    const handlerMaxDelay = 100; // ms - max random delay per task
    const workerPollDelay = 50; // ms - how often workers check for tasks
    // With 2 workers, tasks should complete in roughly half the time
    const expectedDuration = (tasksCount * handlerMaxDelay) / 2;
    const testTimeout = Math.max(expectedDuration * 1.5, 3000); // At least 3 seconds safety margin
    test(
      'should handle race conditions when multiple workers process same task',
      async () => {
        const processedTasks: string[] = [];

        console.log(
          `start testing with ${tasksCount} tasks. the delay per task is ~${handlerMaxDelay}ms.\nWorker poll delay is ${workerPollDelay}ms\nTest timeout is ${Math.round(
            testTimeout / 1000
          )}s`
        );

        const raceHandler = async ({ email, subject }: { email: string; subject: string }) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * handlerMaxDelay));
          processedTasks.push(email);
          return `Processed ${email}`;
        };

        if (!redisClient) return;

        const qm1 = QueueManager.getInstance<TestHandlers>({
          backend: { type: 'redis', redisClient, options: { storageName: storageKey, useLockKey: true } },
          delay: workerPollDelay,
          singleton: false,
          //   logger: console,
        });

        const qm2 = QueueManager.getInstance<TestHandlers>({
          backend: { type: 'redis', redisClient, options: { storageName: storageKey, useLockKey: true } },
          delay: workerPollDelay,
          singleton: false,
          //   logger: console,
        });

        // Register handlers
        qm1.register('emailHandler', raceHandler, { useAutoSchema: true });
        qm2.register('emailHandler', raceHandler, { useAutoSchema: true });

        // Add tasks
        for (let i = 0; i < tasksCount; i++) {
          const task = await qm1.addTaskToQueue('emailHandler', {
            email: `task-${i}@test.com`,
            subject: `Subject ${i}`,
          });
        }

        await Promise.all([qm1.startWorker(), qm2.startWorker()]);
        await new Promise(resolve => setTimeout(resolve, testTimeout));

        // console.log('📊 Final processedTasks:', processedTasks);

        await Promise.all([qm1.stopWorker(), qm2.stopWorker()]);

        expect(processedTasks).toHaveLength(tasksCount);
      },
      testTimeout * 1.2
    );

    // test('should handle concurrent task additions without data corruption', async () => {
    //   const queueManager = QueueManager.getInstance<TestHandlers>({
    //     backend: { type: 'memory' },
    //     delay: 100,
    //     singleton: false,
    //   });

    //   const handler = jest.fn().mockResolvedValue('processed');
    //   queueManager.register('emailHandler', handler);

    //   // Rapidly add 20 tasks concurrently
    //   const addPromises = Array.from({ length: 20 }, (_, i) =>
    //     queueManager.addTaskToQueue('emailHandler', { id: `concurrent-${i}` } as any)
    //   );

    //   const tasks = await Promise.all(addPromises);

    //   // Verify all tasks were added with unique IDs
    //   const taskIds = tasks.map(t => t.id);
    //   const uniqueIds = [...new Set(taskIds)];
    //   expect(uniqueIds).toHaveLength(20);

    //   // Verify all tasks exist in queue
    //   const allTasks = await queueManager.getAllTasks();
    //   expect(allTasks).toHaveLength(20);

    //   await queueManager.stopWorker();
    // });
  });

  //   describe('Singleton vs Non-Singleton Failures', () => {
  //     test('should fail when trying to create multiple singleton instances', async () => {
  //       // Create first singleton
  //       const singleton1 = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'memory' },
  //         singleton: true,
  //       });

  //       // Attempting to create another singleton should return the same instance
  //       const singleton2 = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'file', filePath: testsFileRelPath },
  //         singleton: true,
  //       });

  //       expect(singleton1).toBe(singleton2);

  //       // Configuration should not change for existing singleton
  //       const handler = jest.fn().mockResolvedValue('test');
  //       singleton1.register('emailHandler', handler);
  //       singleton2.register('emailHandler', handler);

  //       // Both should refer to the same instance
  //       expect(singleton1).toBe(singleton2);
  //     });

  //     test('should handle non-singleton instances with different configurations', async () => {
  //       const memoryQueue = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'memory' },
  //         singleton: false,
  //       });

  //       const fileQueue = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'file', filePath: testsFileRelPath },
  //         singleton: false,
  //       });

  //       expect(memoryQueue).not.toBe(fileQueue);

  //       const handler = jest.fn().mockResolvedValue('processed');
  //       memoryQueue.register('emailHandler', handler);
  //       fileQueue.register('emailHandler', handler);

  //       // Add tasks to both
  //       await memoryQueue.addTaskToQueue('emailHandler', { email: 'memory@test.com' } as any);
  //       await fileQueue.addTaskToQueue('emailHandler', { email: 'file@test.com' } as any);

  //       const memoryTasks = await memoryQueue.getAllTasks();
  //       const fileTasks = await fileQueue.getAllTasks();

  //       expect(memoryTasks).toHaveLength(1);
  //       expect(fileTasks).toHaveLength(1);
  //       expect(memoryTasks[0]?.id).not.toBe(fileTasks[0]?.id);

  //       await Promise.all([memoryQueue.stopWorker(), fileQueue.stopWorker()]);
  //     });
  //   });

  //   describe('Multi-Process Failure Scenarios', () => {
  //     test('should handle Redis connection failures in distributed setup', async () => {
  //       if (!redisClient) {
  //         return; // Skip if Redis not available
  //       }

  //       const queueManager = QueueManager.getInstance<TestHandlers>({
  //         backend: {
  //           type: 'redis',
  //           redisClient,
  //           options: { storageName: storageKey },
  //         },
  //         singleton: false,
  //       });

  //       const handler = jest.fn().mockResolvedValue('processed');
  //       queueManager.register('emailHandler', handler);

  //       // Add task when Redis is available
  //       await queueManager.addTaskToQueue('emailHandler', { email: 'test@example.com' } as any);

  //       // Simulate Redis disconnect
  //       await redisClient.disconnect();

  //       // Operations should fail gracefully
  //       try {
  //         await queueManager.addTaskToQueue('emailHandler', { email: 'test2@example.com' } as any);
  //         expect(false).toBe(true); // Should not reach here
  //       } catch (error) {
  //         expect(error).toBeDefined();
  //       }

  //       // Reconnect for cleanup
  //       redisClient.connect();
  //     });

  //     test('should handle distributed lock contention', async () => {
  //       if (!redisClient) {
  //         return; // Skip if Redis not available
  //       }

  //       const processedBy: string[] = [];

  //       // Create two queue managers with locking
  //       const qm1 = QueueManager.getInstance<TestHandlers>({
  //         backend: {
  //           type: 'redis',
  //           redisClient,
  //           options: { storageName: storageKey, useLockKey: true },
  //         },
  //         delay: 50,
  //         singleton: false,
  //       });

  //       const qm2 = QueueManager.getInstance<TestHandlers>({
  //         backend: {
  //           type: 'redis',
  //           redisClient,
  //           options: { storageName: storageKey, useLockKey: true },
  //         },
  //         delay: 50,
  //         singleton: false,
  //       });

  //       const handler1 = jest.fn().mockImplementation(async (payload: any) => {
  //         processedBy.push('worker1');
  //         await new Promise(resolve => setTimeout(resolve, 100));
  //         return 'processed by worker1';
  //       });

  //       const handler2 = jest.fn().mockImplementation(async (payload: any) => {
  //         processedBy.push('worker2');
  //         await new Promise(resolve => setTimeout(resolve, 100));
  //         return 'processed by worker2';
  //       });

  //       qm1.register('emailHandler', handler1);
  //       qm2.register('emailHandler', handler2);

  //       // Add task
  //       await qm1.addTaskToQueue('emailHandler', { email: 'test@example.com' } as any);

  //       // Start both workers
  //       await Promise.all([qm1.startWorker(), qm2.startWorker()]);

  //       // Wait for processing
  //       await new Promise(resolve => setTimeout(resolve, 400));

  //       await Promise.all([qm1.stopWorker(), qm2.stopWorker()]);

  //       // Only one worker should process the task (lock contention)
  //       expect(processedBy).toHaveLength(1);
  //     }, 10000);
  //   });

  //   describe('Handler Registration Failures', () => {
  //     test('should fail when registering handler with schema validation errors', async () => {
  //       const queueManager = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'memory' },
  //         singleton: false,
  //       });

  //       // Register handler that expects specific schema
  //       const schemaHandler = jest.fn().mockImplementation(async (payload: { requiredField: string; optionalField?: number }) => {
  //         if (!payload.requiredField) {
  //           throw new Error('Required field missing');
  //         }
  //         if (payload.optionalField && typeof payload.optionalField !== 'number') {
  //           throw new Error('Optional field must be number');
  //         }
  //       });

  //       queueManager.register('schemaHandler', schemaHandler);

  //       // Test with invalid payload - missing required field
  //       await queueManager.addTaskToQueue('schemaHandler', {} as any);

  //       let errorOccurred = false;
  //       queueManager.on('taskFailed', (task, error) => {
  //         expect(error.message).toContain('Required field missing');
  //         errorOccurred = true;
  //       });

  //       await queueManager.startWorker();
  //       await new Promise(resolve => setTimeout(resolve, 200));
  //       await queueManager.stopWorker();

  //       expect(errorOccurred).toBe(true);
  //     });

  //     test('should handle handler that throws unhandled exceptions', async () => {
  //       const queueManager = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'memory' },
  //         maxRetries: 1,
  //         singleton: false,
  //       });

  //       // Handler that always throws
  //       const faultyHandler = jest.fn().mockImplementation(async () => {
  //         throw new Error('Unhandled exception in handler');
  //       });

  //       queueManager.register('errorHandler', faultyHandler);

  //       await queueManager.addTaskToQueue('errorHandler', { data: 'test' } as any);

  //       let taskFailedCalled = false;
  //       queueManager.on('taskFailed', (task, error) => {
  //         expect(error.message).toContain('Unhandled exception in handler');
  //         taskFailedCalled = true;
  //       });

  //       await queueManager.startWorker();
  //       await new Promise(resolve => setTimeout(resolve, 500));
  //       await queueManager.stopWorker();

  //       expect(taskFailedCalled).toBe(true);
  //       expect(faultyHandler).toHaveBeenCalledTimes(2); // Original + 1 retry
  //     });

  //     test('should handle memory leaks in handlers', async () => {
  //       const queueManager = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'memory' },
  //         singleton: false,
  //       });

  //       const memoryLeaks: any[] = [];

  //       // Handler that creates memory leaks
  //       const leakyHandler = jest.fn().mockImplementation(async (payload: { size: number }) => {
  //         // Create large object that won't be garbage collected properly
  //         const largeObject = new Array(payload.size).fill('memory-leak-data');
  //         memoryLeaks.push(largeObject); // Keep reference to prevent GC
  //         return 'processed';
  //       });

  //       queueManager.register('memoryLeakHandler', leakyHandler);

  //       // Add multiple tasks that will create memory leaks
  //       for (let i = 0; i < 5; i++) {
  //         await queueManager.addTaskToQueue('memoryLeakHandler', { size: 1000 } as any);
  //       }

  //       const initialMemory = process.memoryUsage().heapUsed;

  //       await queueManager.startWorker();
  //       await new Promise(resolve => setTimeout(resolve, 500));
  //       await queueManager.stopWorker();

  //       const finalMemory = process.memoryUsage().heapUsed;
  //       const memoryIncrease = finalMemory - initialMemory;

  //       // Memory should have increased significantly due to leaks
  //       expect(memoryIncrease).toBeGreaterThan(0);
  //       expect(memoryLeaks).toHaveLength(5);
  //     });
  //   });

  //   describe('Task Processing Edge Cases', () => {
  //     test('should handle tasks that exceed maximum processing time', async () => {
  //       const queueManager = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'memory' },
  //         maxProcessingTime: 100, // Very short timeout
  //         singleton: false,
  //       });

  //       // Handler that takes longer than timeout
  //       const slowHandler = jest.fn().mockImplementation(async () => {
  //         await new Promise(resolve => setTimeout(resolve, 300)); // Longer than timeout
  //         return 'should not complete';
  //       });

  //       queueManager.register('slowHandler', slowHandler);

  //       await queueManager.addTaskToQueue('slowHandler', { data: 'test' } as any);

  //       let timeoutErrorOccurred = false;
  //       queueManager.on('taskFailed', (task, error) => {
  //         if (error.message.includes('timeout') || error.message.includes('exceeded')) {
  //           timeoutErrorOccurred = true;
  //         }
  //       });

  //       await queueManager.startWorker();
  //       await new Promise(resolve => setTimeout(resolve, 500));
  //       await queueManager.stopWorker();

  //       // Task should have timed out
  //       expect(timeoutErrorOccurred).toBe(true);
  //     }, 10000);

  //     test('should handle queue overflow scenarios', async () => {
  //       const queueManager = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'memory' },
  //         delay: 1000, // Slow processing to build up queue
  //         singleton: false,
  //       });

  //       const handler = jest.fn().mockImplementation(async () => {
  //         await new Promise(resolve => setTimeout(resolve, 200));
  //         return 'processed';
  //       });

  //       queueManager.register('emailHandler', handler);

  //       // Add many tasks rapidly
  //       const promises = Array.from({ length: 100 }, (_, i) => queueManager.addTaskToQueue('emailHandler', { id: `overflow-${i}` } as any));

  //       const tasks = await Promise.all(promises);
  //       expect(tasks).toHaveLength(100);

  //       // Check queue size
  //       const allTasks = await queueManager.getAllTasks();
  //       expect(allTasks.length).toBeGreaterThan(50); // Most should still be pending

  //       await queueManager.stopWorker();
  //     });

  //     test('should handle corrupted task data recovery', async () => {
  //       const queueManager = QueueManager.getInstance<TestHandlers>({
  //         backend: { type: 'memory' },
  //         singleton: false,
  //       });

  //       const handler = jest.fn().mockResolvedValue('processed');
  //       queueManager.register('emailHandler', handler);

  //       // Add valid task
  //       const task = await queueManager.addTaskToQueue('emailHandler', { email: 'test@example.com' } as any);

  //       // Simulate data corruption by directly modifying task data
  //       const allTasks = await queueManager.getAllTasks();
  //       const corruptedTask = allTasks[0];
  //       if (corruptedTask) {
  //         // Corrupt the payload
  //         (corruptedTask as any).payload = null;
  //         (corruptedTask as any).handler = undefined;
  //       }

  //       let errorOccurred = false;
  //       queueManager.on('taskFailed', () => {
  //         errorOccurred = true;
  //       });

  //       await queueManager.startWorker();
  //       await new Promise(resolve => setTimeout(resolve, 200));
  //       await queueManager.stopWorker();

  //       // Should handle corrupted data gracefully
  //       expect(errorOccurred).toBe(true);
  //     });
  //   });
});
