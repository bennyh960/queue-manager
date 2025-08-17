const errors = {
  TASK_PROCESSING_TIMEOUT: {
    path: ['queueWorker', 'processTaskWithTimeout'],
    message: 'Task processing time exceeded the maximum allowed time.',
  },
  TASK_MAX_RETRIES_EXCEEDED: {
    path: ['queueWorker', 'processTaskWithTimeout'],
    message: 'Task {taskId} has exceeded the maximum number of retries. Error: {errorMessage}',
  },
  TASK_MAX_RETRIES_LIMIT: { path: ['queueManager', 'getInstance'], message: 'Maximum retries limit cannot be greater than {maxRetries}.' },

  INVALID_HANDLER_PARAMS: { path: ['queueManager', 'addTaskToQueue'], message: 'Invalid handler parameters. {details}' },
  HANDLER_NOT_REGISTERED: {
    path: ['HandlerRegistry/get'],
    message: 'Handler is not registered. Please register the handler "{handlerName}" before adding tasks.',
  },

  UNKNOWN_BACKEND_TYPE: {
    path: ['queueManager', 'getBackendRepository'],
    message: 'Unknown backend type. Supported types are: memory, redis, postgres, custom.',
  },

  REPO_FILE_LOAD: {
    path: ['FileRepository'],
    message: `Error loading tasks from {filePath}.\nThe {path} does not exist.\nPlease create the directory first`,
  },
  REPO_FILE_TYPE_MISMATCH: {
    path: ['FileRepository'],
    message: `File path must end with .json format.`,
  },
  REPO_FILE_READ: {
    path: ['FileRepository'],
    message: `Error reading tasks from {filePath}.\nDetails: {details}`,
  },
  REPO_REDIS_SAVE_TASKS: {
    path: ['RedisRepository'],
    message: `saveTasks is not supported in RedisQueueRepository. Use updateTask or enqueue.`,
  },
};

class CustomError extends Error {
  code: keyof typeof errors;
  path: string[];
  constructor(code: keyof typeof errors, ...args: any[]) {
    super();
    const errorMessage = this.formatMessage(errors[code].message, ...args);

    this.message = errorMessage;
    this.code = code;
    this.path = errors[code].path;
    this.name = 'QueueManagerError';

    this.stack = this.toString();
  }

  private formatMessage(message: string, ...args: any[]): string {
    let argIndex = 0;
    return message.replace(/\{[^}]+\}/g, () => args[argIndex++]);
  }

  override toString(): string {
    // stack
    const stackLines = this.stack?.split('\n');
    const userStack = stackLines?.find(line => line.match(/\.(ts|js):\d+:\d+/));
    const errorStack = userStack ? `At: ${userStack.trim()}` : 'No stack trace available';
    return `${errorStack}`;
  }
}

export class TaskProcessingTimeoutError extends CustomError {
  constructor() {
    super('TASK_PROCESSING_TIMEOUT');
  }
}

export class TaskMaxRetriesExceededError extends CustomError {
  constructor(taskId: string, errorMessage: string) {
    super('TASK_MAX_RETRIES_EXCEEDED', taskId, errorMessage);
  }
}

export class HandlerNotRegisteredError extends CustomError {
  constructor(handlerName: string) {
    super('HANDLER_NOT_REGISTERED', handlerName);
  }
}

export class MaxRetriesLimitError extends CustomError {
  constructor(maxRetries: number) {
    super('TASK_MAX_RETRIES_LIMIT', maxRetries.toString());
  }
}

export class UnknownBackendTypeError extends CustomError {
  constructor() {
    super('UNKNOWN_BACKEND_TYPE');
  }
}

export class InvalidHandlerParamsError extends CustomError {
  constructor(details?: string) {
    super('INVALID_HANDLER_PARAMS', details || 'No details provided');
  }
}

// REPOSITORY ERRORS
export class FileRepositoryLoadError extends CustomError {
  constructor(filePath: string, path: string) {
    super('REPO_FILE_LOAD', filePath, path);
  }
}

export class FileRepositoryTypeMismatchError extends CustomError {
  constructor() {
    super('REPO_FILE_TYPE_MISMATCH');
  }
}

export class FileRepositoryReadError extends CustomError {
  constructor(filePath: string, details: string) {
    super('REPO_FILE_READ', filePath, details);
  }
}

export class RedisRepositorySaveTasksError extends CustomError {
  constructor() {
    super('REPO_REDIS_SAVE_TASKS');
  }
}
