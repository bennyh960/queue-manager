import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { QueueManager } from '../../../lib/QueueManager.js';

type TestHandlers = {
  testHandler: (payload: { data: string }) => Promise<string>;
  errorHandler: (payload: any) => Promise<never>;
  slowHandler: (payload: { data: string }) => Promise<string>;
};

describe('QueueManager - Critical Failure Scenarios', () => {
  let storageKey: string;

  beforeEach(() => {
    storageKey = `test-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  });

  describe('1. Concurrency Issues', () => {
    test('should handle race conditions with multiple workers on memory backend', async () => {
      const processedTasks: string[] = [];

      const handler = jest.fn().mockImplementation(async (payload: { data: string }) => {
        // Simulate processing time to create race conditions
        await new Promise(resolve => setTimeout(resolve, 50));
        processedTasks.push(payload.data);
        return `Processed ${payload.data}`;
      });

      // Create two separate queue managers (non-singleton)
      const qm1 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        delay: 10,
        singleton: false,
      });

      const qm2 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        delay: 10,
        singleton: false,
      });

      qm1.register('testHandler', handler);
      qm2.register('testHandler', handler);

      // Add tasks to first queue manager
      for (let i = 0; i < 3; i++) {
        await qm1.addTaskToQueue('testHandler', { data: `task-${i}` });
      }

      // Start both workers
      await qm1.startWorker();
      await qm2.startWorker();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 400));

      await qm1.stopWorker();
      await qm2.stopWorker();

      // Each task should be processed only once (no duplicates)
      expect(processedTasks).toHaveLength(3);
      expect(new Set(processedTasks).size).toBe(3);
    });

    test('should handle concurrent task additions without losing data', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      // Add many tasks concurrently
      const promises = Array.from({ length: 10 }, (_, i) => queueManager.addTaskToQueue('testHandler', { data: `concurrent-${i}` }));

      const tasks = await Promise.all(promises);

      // All tasks should be added successfully
      expect(tasks).toHaveLength(10);

      // All should have unique IDs
      const taskIds = tasks.map(t => t.id);
      expect(new Set(taskIds).size).toBe(10);

      const allTasks = await queueManager.getAllTasks();
      expect(allTasks).toHaveLength(10);
    });
  });

  describe('2. Singleton vs Non-Singleton Behavior', () => {
    test('should enforce singleton pattern correctly', () => {
      const singleton1 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: true,
      });

      const singleton2 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'file', filePath: './different.json' }, // Different config
        singleton: true,
      });

      // Should be the same instance regardless of config
      expect(singleton1).toBe(singleton2);
    });

    test('should create separate instances for non-singleton', () => {
      const instance1 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      const instance2 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      // Should be different instances
      expect(instance1).not.toBe(instance2);
    });

    test('should handle data isolation between non-singleton instances', async () => {
      const qm1 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      const qm2 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      await qm1.addTaskToQueue('testHandler', { data: 'instance1-task' });
      await qm2.addTaskToQueue('testHandler', { data: 'instance2-task' });

      const tasks1 = await qm1.getAllTasks();
      const tasks2 = await qm2.getAllTasks();

      // Each instance should only see its own tasks
      expect(tasks1).toHaveLength(1);
      expect(tasks2).toHaveLength(1);
      expect(tasks1[0]?.payload.data).toBe('instance1-task');
      expect(tasks2[0]?.payload.data).toBe('instance2-task');
    });
  });

  describe('3. Handler Registration Edge Cases', () => {
    test('should handle handler registration without proper error handling', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        maxRetries: 1,
        singleton: false,
      });

      // Handler that always throws
      const faultyHandler = jest.fn().mockImplementation(async () => {
        throw new Error('Handler deliberately fails');
      });

      queueManager.register('errorHandler', faultyHandler);

      await queueManager.addTaskToQueue('errorHandler', { data: 'test' });

      let taskFailedCount = 0;
      queueManager.on('taskFailed', () => {
        taskFailedCount++;
      });

      await queueManager.startWorker();
      await new Promise(resolve => setTimeout(resolve, 300));
      await queueManager.stopWorker();

      // Should have failed and retried
      expect(faultyHandler).toHaveBeenCalledTimes(2); // Original + 1 retry
      expect(taskFailedCount).toBe(1);
    });

    test('should handle handlers with schema validation failures', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      // Handler that validates input
      const validatingHandler = jest.fn().mockImplementation(async (payload: any) => {
        if (!payload.requiredField) {
          throw new Error('Missing required field');
        }
        return 'valid';
      });

      queueManager.register('testHandler', validatingHandler);

      // Add task with invalid payload
      await queueManager.addTaskToQueue('testHandler', { data: 'no required field' });

      let validationError: string | null = null;
      queueManager.on('taskFailed', (task, error) => {
        validationError = error.message;
      });

      await queueManager.startWorker();
      await new Promise(resolve => setTimeout(resolve, 200));
      await queueManager.stopWorker();

      expect(validationError).toContain('Missing required field');
    });
  });

  describe('4. Processing Edge Cases', () => {
    test('should handle very slow handlers without deadlock', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        maxProcessingTime: 200, // Short timeout
        singleton: false,
      });

      const slowHandler = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Exceeds timeout
        return 'should not complete';
      });

      queueManager.register('slowHandler', slowHandler);

      await queueManager.addTaskToQueue('slowHandler', { data: 'slow-task' });

      let timeoutOccurred = false;
      queueManager.on('taskFailed', (task, error) => {
        if (error.message.includes('timeout') || error.message.includes('exceeded')) {
          timeoutOccurred = true;
        }
      });

      await queueManager.startWorker();
      await new Promise(resolve => setTimeout(resolve, 800));
      await queueManager.stopWorker();

      expect(timeoutOccurred).toBe(true);
    });

    test('should handle queue overflow gracefully', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        delay: 1000, // Very slow processing
        singleton: false,
      });

      const handler = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'processed';
      });

      queueManager.register('testHandler', handler);

      // Add many tasks rapidly
      const promises: Promise<any>[] = [];
      for (let i = 0; i < 20; i++) {
        promises.push(queueManager.addTaskToQueue('testHandler', { data: `overflow-${i}` }));
      }

      const tasks = await Promise.all(promises);
      expect(tasks).toHaveLength(20);

      // Queue should accept all tasks
      const allTasks = await queueManager.getAllTasks();
      expect(allTasks.length).toBeGreaterThanOrEqual(15); // Most should be pending
    });
  });

  describe('5. Backend-Specific Failures', () => {
    test('should handle file backend initialization failures', () => {
      // Test with invalid file path
      expect(() => {
        QueueManager.getInstance<TestHandlers>({
          backend: {
            type: 'file',
            filePath: '/invalid/path/that/does/not/exist/queue.json',
          },
          singleton: false,
        });
      }).not.toThrow(); // Should not throw during instantiation
    });

    test('should handle memory backend isolation between instances', async () => {
      const qm1 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      const qm2 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      // Add different tasks to each
      await qm1.addTaskToQueue('testHandler', { data: 'memory1' });
      await qm2.addTaskToQueue('testHandler', { data: 'memory2' });

      const tasks1 = await qm1.getAllTasks();
      const tasks2 = await qm2.getAllTasks();

      // Memory should be isolated
      expect(tasks1).toHaveLength(1);
      expect(tasks2).toHaveLength(1);
      expect(tasks1[0]?.payload.data).not.toBe(tasks2[0]?.payload.data);
    });
  });
});
