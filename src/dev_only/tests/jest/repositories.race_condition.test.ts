import { describe, expect, test, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { QueueManager } from '../../../lib/QueueManager.js';
import { Redis } from 'ioredis';
import { cleanRedisKeys, createHandlers, pgPool, redisClient, TEST_CONFIG, TestHandlers } from './constants.helpers.js';
import { QueueBackendConfig, Task } from '../../../index.js';
import { DefaultLogger } from '../../logger.js';
import { Pool } from 'pg';

// npm test src/dev_only/tests/jest/repositories.race_condition.test.ts

const logger = new DefaultLogger({ level: 'error' });

const RACE_TEST_CONFIG: TEST_CONFIG = {
  tasksCount: 200,
  handlerBaseDelay: 50, // Base delay for handler processing
  handlerRandomDelay: 50, // Additional random delay (0-50ms)
  workerPollDelay: 25, // How often workers check for new tasks
  testTimeoutMultiplier: 5, // Safety margin for test timeout (not so safety)
};

describe('Race Conditions - Multi-Worker Processing', () => {
  let storageKey: string;

  // Calculate test duration
  const maxExpectedTime = (RACE_TEST_CONFIG.tasksCount * (RACE_TEST_CONFIG.handlerBaseDelay + RACE_TEST_CONFIG.handlerRandomDelay)) / 2; // 2 workers

  beforeEach(() => {
    storageKey = `race-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  });

  // Helper function to run race condition test for any backend
  const runRaceConditionTest = async (backendConfig: { backend: QueueBackendConfig }, testName: string, useLocking: boolean = true) => {
    const { handlers, getResults } = createHandlers(RACE_TEST_CONFIG);

    logger.info(`\n🏁 ${testName} Race Test:`);
    logger.info(`   Tasks: ${RACE_TEST_CONFIG.tasksCount}`);
    logger.info(`   Handler delay: ${RACE_TEST_CONFIG.handlerBaseDelay}±${RACE_TEST_CONFIG.handlerRandomDelay}ms`);
    logger.info(`   Worker poll: ${RACE_TEST_CONFIG.workerPollDelay}ms`);
    logger.info(`   Locking: ${useLocking ? 'ENABLED' : 'DISABLED'}`);
    logger.info(`   Expected duration: ~${Math.round(maxExpectedTime / 1000)}s`);

    // Create two worker instances
    const qm1 = QueueManager.getInstance<TestHandlers>({
      ...backendConfig,
      delay: RACE_TEST_CONFIG.workerPollDelay,
      singleton: false,
    });

    const qm2 = QueueManager.getInstance<TestHandlers>({
      ...backendConfig,
      delay: RACE_TEST_CONFIG.workerPollDelay,
      singleton: false,
    });

    // Register handlers on both workers
    qm1.register('sendEmail', handlers.sendEmail, { useAutoSchema: true });
    qm1.register('heavyCalculation', handlers.heavyCalculation, { useAutoSchema: true });
    qm1.register('fileProcess', handlers.fileProcess, { useAutoSchema: true });

    qm2.register('sendEmail', handlers.sendEmail, { useAutoSchema: true });
    qm2.register('heavyCalculation', handlers.heavyCalculation, { useAutoSchema: true });
    qm2.register('fileProcess', handlers.fileProcess, { useAutoSchema: true });

    // Add variety of tasks
    const taskPromises: Promise<Task<TestHandlers>>[] = [];
    for (let i = 0; i < RACE_TEST_CONFIG.tasksCount; i++) {
      const taskType = i % 3; // Rotate between task types

      if (taskType === 0) {
        taskPromises.push(
          qm1.addTaskToQueue('sendEmail', {
            email: `user${i}@test.com`,
            subject: `Test Subject ${i}`,
            body: `Test body content for email ${i}`,
          })
        );
      } else if (taskType === 1) {
        taskPromises.push(
          qm1.addTaskToQueue('heavyCalculation', {
            numbers: [i, i + 1, i + 2],
            operation: i % 2 === 0 ? 'sum' : 'multiply',
          } as any)
        );
      } else {
        taskPromises.push(
          qm1.addTaskToQueue('fileProcess', {
            filename: `file${i}.txt`,
            content: `File content ${i} `.repeat(10),
          })
        );
      }
    }

    await Promise.all(taskPromises);
    logger.info(`   ✅ Added ${RACE_TEST_CONFIG.tasksCount} tasks to queue`);

    // Start both workers simultaneously
    const startTime = Date.now();
    await Promise.all([qm1.startWorker(), qm2.startWorker()]);
    logger.info(`   🏃 Both workers started`);

    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, maxExpectedTime * 3));

    // Stop workers
    await Promise.all([qm1.stopWorker(), qm2.stopWorker()]);
    const endTime = Date.now();

    const { processedTasks, processingLog } = getResults();

    logger.info(`   ⏱️  Actual duration: ${Math.round((endTime - startTime) / 1000)}s`);
    logger.info(`   📊 Processed: ${processedTasks.length}/${RACE_TEST_CONFIG.tasksCount} tasks`);

    if (useLocking) {
      // With locking: should process exactly the expected number, no duplicates
      expect(processedTasks).toHaveLength(RACE_TEST_CONFIG.tasksCount);
      const uniqueTasks = [...new Set(processedTasks)];
      expect(uniqueTasks).toHaveLength(RACE_TEST_CONFIG.tasksCount);
      logger.info(`   ✅ No duplicate processing (locking works)`);
    } else {
      // Without locking: might have duplicates due to race conditions
      const uniqueTasks = [...new Set(processedTasks)];
      logger.info(`   📈 Total processed: ${processedTasks.length} (${processedTasks.length - uniqueTasks.length} duplicates)`);

      expect(uniqueTasks.length).toBeLessThanOrEqual(RACE_TEST_CONFIG.tasksCount);
      if (processedTasks.length > uniqueTasks.length) {
        logger.warn(`   ⚠️  Race conditions detected: ${processedTasks.length - uniqueTasks.length} duplicate(s)`);
      }
    }

    return { processedTasks, processingLog, duration: endTime - startTime };
  };

  describe('REDIS : race conditions test', () => {
    beforeAll(async () => {
      try {
        await redisClient.ping();
        logger.info('✅ Redis available for race condition tests');
      } catch (error) {
        logger.warn('⚠️ Redis not available, skipping Redis race condition tests', error);
        redisClient?.disconnect();
      }
    });
    afterEach(async () => {
      // Clean up Redis keys if using Redis
      // await cleanRedisKeys(storageKey);
    });

    afterAll(async () => {
      if (redisClient) {
        redisClient.disconnect();
      }
    }, Math.min(maxExpectedTime, 30000));

    test(
      'should prevent race conditions with Redis locking',
      async () => {
        if (!redisClient) {
          logger.warn('⏭️  Skipping Redis locking test - Redis not available');
          return;
        }

        await runRaceConditionTest(
          {
            backend: {
              type: 'redis',
              redisClient,
              options: { storageName: storageKey, useLockKey: true },
            },
          },
          'Redis Backend',
          true
        );
      },
      RACE_TEST_CONFIG.testTimeoutMultiplier * maxExpectedTime
    );
  });

  describe('Postgres : Race Conditions', () => {
    // beforeAll(async () => {
    //   try {
    //     await pgPool.connect();
    //     logger.info('✅ PostgreSQL available for race condition tests');
    //   } catch (error) {
    //     logger.warn('⚠️ PostgreSQL not available, skipping PostgreSQL race condition tests', error);
    //     pgPool?.end();
    //   }
    // });

    // afterAll(async () => {
    //   if (pgPool) {
    //     pgPool.end();
    //   }
    // }, Math.max(maxExpectedTime, 30000));
    test('should prevent race conditions with Postgres locking', async () => {
      await runRaceConditionTest(
        {
          backend: {
            type: 'postgres',
            pg: pgPool,
          },
        },
        'Postgres Backend',
        true
      );
    });
  });
});
