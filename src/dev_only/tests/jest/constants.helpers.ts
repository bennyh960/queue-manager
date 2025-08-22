import fs from 'fs/promises';
import { Redis } from 'ioredis';
import path from 'path';
import { Pool } from 'pg';

export const testsFileRelPath = path.join(process.cwd(), 'data', 'tasks.json');

export const resetFileContentMethod = async () => {
  try {
    // Ensure the data directory exists
    await fs.mkdir(path.dirname(testsFileRelPath), { recursive: true });
    await fs.writeFile(testsFileRelPath, JSON.stringify([]));
  } catch {
    // Ignore errors, create directory and file
    await fs.mkdir(path.dirname(testsFileRelPath), { recursive: true });
    await fs.writeFile(testsFileRelPath, JSON.stringify([]));
  }
};

export type TEST_CONFIG = {
  tasksCount: number;
  handlerBaseDelay: number;
  handlerRandomDelay: number;
  workerPollDelay: number;
  testTimeoutMultiplier: number;
};

export type TestHandlers = {
  sendEmail: (payload: { email: string; subject: string; body: string }) => Promise<string>;
  heavyCalculation: (payload: { numbers: number[]; operation: 'sum' | 'multiply' }) => Promise<number>;
  fileProcess: (payload: { filename: string; content: string }) => Promise<string>;
};

// Demo handlers that simulate real work
export const createHandlers = (
  TEST_CONFIG: TEST_CONFIG
): {
  handlers: TestHandlers;
  getResults: () => { processedTasks: string[]; processingLog: Array<{ task: string; worker: string; timestamp: number }> };
} => {
  const processedTasks: string[] = [];
  const processingLog: Array<{ task: string; worker: string; timestamp: number }> = [];

  const sendEmail = async ({ email, subject, body }: { email: string; subject: string; body: string }) => {
    const workerId = Math.random().toString(36).slice(2, 7); // Simulate worker ID
    const startTime = Date.now();

    processingLog.push({ task: email, worker: workerId, timestamp: startTime });

    // Simulate email sending with random delay
    const delay = TEST_CONFIG.handlerBaseDelay; //+ Math.random() * TEST_CONFIG.handlerRandomDelay;
    await new Promise(resolve => setTimeout(resolve, delay));

    processedTasks.push(email);
    return `Email sent to ${email} by worker ${workerId}`;
  };

  const heavyCalculation = async ({ numbers, operation }: { numbers: number[]; operation: 'sum' | 'multiply' }) => {
    const taskId = `calc-${numbers.map(n => n.toString()).join('-')}-${operation}`;
    const workerId = Math.random().toString(36).slice(2, 7);

    processingLog.push({ task: taskId, worker: workerId, timestamp: Date.now() });

    // Simulate heavy calculation
    const delay = TEST_CONFIG.handlerBaseDelay; //+ Math.random() * TEST_CONFIG.handlerRandomDelay;
    await new Promise(resolve => setTimeout(resolve, delay));

    const result = operation === 'sum' ? numbers.reduce((a, b) => a + b, 0) : numbers.reduce((a, b) => a * b, 1);

    processedTasks.push(taskId);
    return result;
  };

  const fileProcess = async ({ filename, content }: { filename: string; content: string }) => {
    const workerId = Math.random().toString(36).slice(2, 7);

    processingLog.push({ task: filename, worker: workerId, timestamp: Date.now() });

    // Simulate file processing
    const delay = TEST_CONFIG.handlerBaseDelay; // + Math.random() * TEST_CONFIG.handlerRandomDelay;
    await new Promise(resolve => setTimeout(resolve, delay));

    processedTasks.push(filename);
    return `File ${filename} processed by worker ${workerId} (${content.length} chars)`;
  };

  return {
    handlers: { sendEmail, heavyCalculation, fileProcess },
    getResults: () => ({ processedTasks, processingLog }),
  };
};

export const redisClient = new Redis({
  host: 'localhost',
  port: 6380, // Docker Redis
});

export const pgPool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'queue_manager',
  password: '123456',
  port: 5432,
});

export const cleanRedisKeys = async (storageKey: string) => {
  if (redisClient) {
    try {
      const keys = await redisClient.keys(`${storageKey}*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (error) {
      // Ignore cleanup errors
      console.warn('⚠️ Error cleaning up Redis keys', error);
    }
  }
};
