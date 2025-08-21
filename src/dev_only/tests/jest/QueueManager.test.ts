import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { QueueManager } from '../../../lib/QueueManager.js';

describe('QueueManager', () => {
  let queueManager: QueueManager<any>;
  const delay = 10000;

  beforeEach(() => {
    queueManager = QueueManager.getInstance({
      delay: delay,
      backend: { type: 'memory' },
      singleton: false, // Use non-singleton for testing
    });
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await queueManager.stopWorker();
    } catch {
      // Ignore errors if worker was already stopped
    }
  });

  test('should create QueueManager instance', () => {
    expect(queueManager).toBeInstanceOf(QueueManager);
  });

  test('should register a handler', () => {
    const mockHandler = jest.fn();

    queueManager.register('test-task', mockHandler);

    // This test verifies that handler registration works
    expect(() => queueManager.register('test-task', mockHandler)).not.toThrow();
  });

  test(
    'should start and stop worker',
    async () => {
      // Start the worker
      await queueManager.startWorker();

      // Stop the worker
      await queueManager.stopWorker();

      // If we reach here without throwing, the test passes
      expect(true).toBe(true);
    },
    delay + 1
  ); // Increase timeout to 10 seconds

  test('should add task to queue', async () => {
    const mockHandler = jest.fn().mockResolvedValue('success');

    queueManager.register('test-task', mockHandler);

    const task = await queueManager.addTaskToQueue('test-task', { data: 'test' });
    expect(task).toBeDefined();
    expect(task.handler).toBe('test-task');
    expect(task.payload).toEqual({ data: 'test' });
  });
});
