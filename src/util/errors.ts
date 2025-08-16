export const errors = {
  QUEUE_MANAGER_NOT_INITIALIZED: 'QueueManager is not initialized. Please call getInstance() first.',
};

class customError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomError';
  }
}

export class TaskProcessingTimeoutError extends customError {
  constructor(message = 'Task max processing time is timed out') {
    super(message);
    this.name = 'TaskProcessingTimeoutError';
  }
}

// const testFunc = () => {
//   try {
//     throw new TaskProcessingTimeoutError('Task processing timed out');
//   } catch (error) {
//     if (error instanceof TaskProcessingTimeoutError) {
//       console.error('Caught a TaskProcessingTimeoutError:', error.message);
//     } else {
//       console.error('Caught an unexpected error:', error);
//     }
//   }
// }

export class TaskMaxRetriesExceededError extends customError {
  constructor(message: string) {
    super(message);
    this.name = 'TaskMaxRetriesExceededError';
  }
}
