import { describe, expect, test, beforeEach } from '@jest/globals';
import { QueueManager } from '../../../lib/QueueManager.js';

type TestHandlers = {
  testHandler: (payload: { data: string }) => Promise<string>;
};

describe('QueueManager - Real Failure Cases', () => {
  describe('Critical Issue: Handler Registration Failure', () => {
    test('should fail when trying to process task without registered handler', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      // Add task WITHOUT registering handler first - this should fail
      await queueManager.addTaskToQueue('testHandler', { data: 'test' });

      let errorOccurred = false;
      let errorMessage = '';

      queueManager.on('taskFailed', (task, error) => {
        errorOccurred = true;
        errorMessage = error.message;
      });

      // Try to start worker - should fail when trying to process unregistered handler
      await queueManager.startWorker();
      await new Promise(resolve => setTimeout(resolve, 100));
      await queueManager.stopWorker();

      expect(errorOccurred).toBe(true);
      expect(errorMessage).toContain('not registered');
    });

    test('should allow adding tasks before registering handlers', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      // This should work - adding tasks before handlers
      const task = await queueManager.addTaskToQueue('testHandler', { data: 'test' });
      expect(task).toBeDefined();
      expect(task.handler).toBe('testHandler');

      const allTasks = await queueManager.getAllTasks();
      expect(allTasks).toHaveLength(1);
    });
  });

  describe('Memory Backend Isolation Issues', () => {
    test('should NOT share memory between non-singleton instances', async () => {
      // Create two separate non-singleton instances
      const qm1 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      const qm2 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      // Register handlers for both
      const handler1 = jest.fn().mockResolvedValue('processed by qm1');
      const handler2 = jest.fn().mockResolvedValue('processed by qm2');

      qm1.register('testHandler', handler1);
      qm2.register('testHandler', handler2);

      // Add tasks to each
      await qm1.addTaskToQueue('testHandler', { data: 'qm1-task' });
      await qm2.addTaskToQueue('testHandler', { data: 'qm2-task' });

      const tasks1 = await qm1.getAllTasks();
      const tasks2 = await qm2.getAllTasks();

      console.log(
        'QM1 tasks:',
        tasks1.map(t => t.payload.data)
      );
      console.log(
        'QM2 tasks:',
        tasks2.map(t => t.payload.data)
      );

      // If memory is properly isolated, each should only see their own tasks
      expect(tasks1).toHaveLength(1);
      expect(tasks2).toHaveLength(1);
      expect(tasks1[0]?.payload.data).toBe('qm1-task');
      expect(tasks2[0]?.payload.data).toBe('qm2-task');
    });
  });

  describe('Singleton vs Non-Singleton Critical Cases', () => {
    test('singleton should maintain same instance across different configs', () => {
      const singleton1 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        delay: 100,
        singleton: true,
      });

      const singleton2 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'file', filePath: './different.json' },
        delay: 500, // Different config
        singleton: true,
      });

      expect(singleton1).toBe(singleton2);
      console.log('Singleton test passed - same instance returned');
    });

    test('non-singleton should create different instances', () => {
      const instance1 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      const instance2 = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      expect(instance1).not.toBe(instance2);
      console.log('Non-singleton test passed - different instances created');
    });
  });

  describe('Concurrency Race Conditions', () => {
    test('should handle rapid task additions without corruption', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        singleton: false,
      });

      const handler = jest.fn().mockResolvedValue('processed');
      queueManager.register('testHandler', handler);

      // Add 10 tasks rapidly in parallel
      const promises = Array.from({ length: 10 }, (_, i) => queueManager.addTaskToQueue('testHandler', { data: `task-${i}` }));

      const tasks = await Promise.all(promises);

      // All tasks should be created successfully
      expect(tasks).toHaveLength(10);

      // All should have unique IDs
      const taskIds = tasks.map(t => t.id);
      const uniqueIds = new Set(taskIds);
      expect(uniqueIds.size).toBe(10);

      // Verify in queue
      const allTasks = await queueManager.getAllTasks();
      expect(allTasks).toHaveLength(10);
    });

    test('should process tasks correctly with single worker', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        delay: 50,
        singleton: false,
      });

      const processedTasks: string[] = [];
      const handler = jest.fn().mockImplementation(async (payload: { data: string }) => {
        processedTasks.push(payload.data);
        return `processed ${payload.data}`;
      });

      queueManager.register('testHandler', handler);

      // Add tasks
      await queueManager.addTaskToQueue('testHandler', { data: 'task1' });
      await queueManager.addTaskToQueue('testHandler', { data: 'task2' });

      // Start processing
      await queueManager.startWorker();
      await new Promise(resolve => setTimeout(resolve, 300));
      await queueManager.stopWorker();

      console.log('Processed tasks:', processedTasks);
      expect(processedTasks).toHaveLength(2);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling Critical Cases', () => {
    test('should handle handler that throws errors', async () => {
      const queueManager = QueueManager.getInstance<TestHandlers>({
        backend: { type: 'memory' },
        maxRetries: 1,
        singleton: false,
      });

      const faultyHandler = jest.fn().mockImplementation(async () => {
        throw new Error('Handler error');
      });

      queueManager.register('testHandler', faultyHandler);
      await queueManager.addTaskToQueue('testHandler', { data: 'test' });

      let errorMessage = '';
      queueManager.on('taskFailed', (task, error) => {
        errorMessage = error.message;
      });

      await queueManager.startWorker();
      await new Promise(resolve => setTimeout(resolve, 200));
      await queueManager.stopWorker();

      console.log('Error message:', errorMessage);
      expect(faultyHandler).toHaveBeenCalledTimes(2); // Original + 1 retry
      expect(errorMessage).toContain('Handler error');
    });
  });
});
