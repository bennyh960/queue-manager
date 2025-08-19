# queue-manager-pro

---

A flexible, type-safe, and extensible task queue for Node.js and TypeScript.  
Supports in-memory, file-based,redis , postgres and custom persistent backends.  
Features handler registration, event-driven lifecycle, retries, priorities, and graceful worker
management.

---

## Features

- **Pluggable storage**: in-memory, file,redis, postgres or custom repositories
- **Event-driven**: listen to task lifecycle events
- **Retries, priorities, stuck task detection**
- **Type-safe task and payload binding** via TypeScript generics
- **Singleton or multi-instance** queue management
- **Atomic dequeue for multi-process setups**

---

## 🚧 Project Status: Actively Improving

> **Note:**  
> This library is currently under active development and continuous improvement.  
> We encourage you to regularly update to the latest version to benefit from enhancements and
> fixes.  
> **At this stage, updates are not expected to introduce breaking changes or impact your existing
> usage.**
>
> Please feel free to upgrade frequently. Once the API or functionality stabilizes, we will add a
> special notice here.

## Installation

```bash
npm install queue-manager-pro
```

---

## Quick Start

### 1. Define Your Handlers

```typescript
const handlers = {
  sendEmail: async ({ email }: { email: string }) => {
    // ...send email logic
  },
  resizeImage: async ({ imageUrl }: { imageUrl: string }) => {
    // ...resize logic
  },
};
```

### 2. Create a Queue Instance

```typescript
import { QueueManager } from 'queue-manager-pro';

const queue = QueueManager.getInstance<typeof handlers>({
  backend: { type: 'file', filePath: './tasks.json' }, // or 'memory' /'redis' / 'postgres' / 'custom'
});
```

### 3. Register Handlers

```typescript
// optional options will override instance `maxRetries` and `maxProcessingTime` for the particular handler
queue.register('sendEmail', handlers.sendEmail, { maxRetries: 3, maxProcessingTime: 5000 });
queue.register('resizeImage', handlers.resizeImage);
```

### 4. Add Tasks

```typescript
await queue.addTaskToQueue('resizeImage', { imageUrl: 'https://...' });
// task options are optional but strongest , they  will override the handler options
await queue.addTaskToQueue(
  'sendEmail',
  { email: 'test@example.com' },
  { maxProcessingTime: 5000, maxRetries: 3, priority: 3 }
);
```

### 5. Start the Worker

```typescript
queue.startWorker();
```

## API Reference

### `QueueManager.getInstance(options)`

- **Options:**
  - `backend`: `{ type: 'file' | 'memory' | 'postgres' | 'redis'| 'custom', ... }` instances , each
    backend type has its own specific options.
  - `delay`: Polling interval in ms (default: 10000)
  - `logger`: Optional logger - support common loggers libraries and 'console'
  - `singleton`: Use singleton instance (default: true)
  - `maxRetries`: max retries for tasks that failed or exceeding max processing time could be
    override by handler or task maxRetries property. (default: 3)
  - `maxProcessingTime`: max processing time for tasks that stack on processing status too long
    (default: 10 min)
  - `crashOnWorkerError`: if `true` it will stop the worker and throw the error (no event emission)
    else Emit the taskFailed event for external handlers.. (default: false)

#### `Storage Backends`

- Memory: Fast, non-persistent (lost on restart)
- File: local JSON file-based, atomic writes . options: (`filePath:string`)
- Redis: using 'ioredis' instance , `{redisClient:Redis, storageName?:string, useLockKey?:boolean}`
- Postgres: using 'pg' pool instance ,
`{pg:pg.Pool , {tableName?:string,schema?:string, useMigrate:boolean}}`
<!-- - Custom: Plug in your own repository (e.g.MongoDB) -  -->

---

### `queue.register(name, handler, options?)`

- Register a handler function for a task type.
- **Parameters:**

  - `name`: string — Handler name
  - `handler`: function — Handler function `(payload) => any`
  - `options`(optional):

    - `maxRetries?` : number - same as the instance 'maxRetries' but it will override the instance
      'maxRetries' for the particular handler.

    - `maxProcessingTime`:number - same as instance 'maxProcessingTime' but it will override the
      instance 'maxProcessingTime' for the particular handler.
    - `useAutoSchema?`:boolean - using regex to identify handler params - cover 90% of cases .
    - `paramSchema?` : a function that get payload as arg , inside you can use your own default
      schema to validate the payload . (payload:any)=> {isValid:boolean,message:string|null ,
      source:string}

  **_See
  [register](https://github.com/bennyh960/queue-manager/blob/main/examples/handlerRegister.md) for
  usage examples._**

---

### `queue.addTaskToQueue(handler, payload, options?)`

Add a new task to the queue.

- **Parameters:**
  - `handler`: string — Name of the registered handler
  - `payload`: object — args for the handler (type-checked)
  - `options`:
    `{ maxRetries?: number, maxProcessingTime?: number, priority?: number,skipOnPayloadError?:boolean }`
    (optional)
    - `maxRetries`: you can set this value for particular task and it will ignore handler and
      instance maxRetries
    - `maxProcessingTime` : same as maxRetries , you can specify maxProcessingTime for this
      particular task if you expect this specific task might take longer/shorter then
      handler/instance maxProcessingTime
    - `priority` : the queue is design for 'FIFO' , but if you specify priority for a task it will
      process the higher priority first.
    - `skipOnPayloadError` : if it `true` , it will just warn you if payload is not valid but
      continue. else if it `false` it will kill the process and u get runtime error.
- **Returns:** `Promise<Task>`

---

### `queue.startWorker(concurrency = 1)`

- Start processing tasks with the specified concurrency.
- **Parameters:**
  - `concurrency`: number (default: 1)

---

### `queue.stopWorker()`

- Gracefully stop all workers.

---

### `queue.on(event, listener)`

- Listen to task lifecycle events.
- **Events:**
  - `taskAdded`, `taskStarted`, `taskCompleted`, `taskFailed`, `taskRetried`, `taskRemoved`,
    `taskStuck`
- **Example:**
  ```typescript
  queue.on('taskCompleted', task => {
    console.log('Task completed:', task);
  });
  ```

---

### More API methods

#### `queue.getAllTasks(status?)`

- Inspect all current tasks if status is undefined else inspect all tasks with specified status.

#### `queue.getTaskById(id)`

- inspect task by id

#### `queue.updateTask(id,updatedProperties)`

- update specific task
- updatedProperties - (Partial<Task<handlerMap>>) the fields to update

#### `queue.removeTask(id,hardDelete?)`

- delete task by id
- hardDelete (boolean, default:false) - if true it will remove the task permanently , else the
  status will be 'deleted'

### `Type Safety`

- Handlers and payloads are type-checked.
- Task shape is inferred from your handler signatures.

<!-- ### More Examples:

- custom repository
- redis repository
- postgres repository -->

---

## Events

You can listen to various lifecycle events emitted by the queue instance:

| Event         | Listener Signature | Description                                 |
| ------------- | ------------------ | ------------------------------------------- |
| taskAdded     | (task)             | Fired when a new task is added              |
| taskStarted   | (task)             | Fired when a task starts processing         |
| taskCompleted | (task)             | Fired when a task completes successfully    |
| taskFailed    | (task, error)      | Fired when a task handler throws an error   |
| taskRetried   | (task)             | Fired when a task is retried                |
| taskRemoved   | (task)             | Fired when a task is removed from the queue |
| taskStuck     | (task)             | Fired when a task is detected as stuck      |

**Example:**

```typescript
queue.on('taskCompleted', task => {
  console.log('Task completed:', task);
});
```

---

## Advanced

- **Graceful Shutdown:**  
  Use `await queue.stopWorker()` to gracefully stop all workers and ensure no tasks are left in an
  inconsistent state.

- **Inspect Handlers:**  
  Call `queue.inspectHandler('handlerName')` to retrieve metadata and configuration details about a
  registered handler.

- **Custom Logger:**  
  Provide a custom logger by passing a `LoggerLike` object to the `logger` option when initializing
  the queue. This allows you to integrate with your preferred logging solution.

---

## License

MIT

---

## Contributing

Pull requests and issues are welcome!  
If you have suggestions, bug reports, or want to contribute new features, please open an issue or
submit a PR.

---
