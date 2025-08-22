# Storage Backends Guide

The Queue Manager provides flexible storage backend options to meet diverse application
requirements. Each backend is optimized for specific use cases, from rapid development to
production-scale deployments.

## 📋 Overview

| Backend        | Use Case                    | Persistence | Scalability | Performance | Multi-Process Support |
| -------------- | --------------------------- | ----------- | ----------- | ----------- | --------------------- |
| **Memory**     | Development, Testing        | ❌          | Low         | Excellent   | ❌                    |
| **File**       | Simple Apps, Prototyping    | ✅          | Low         | Good        | ❌                    |
| **Redis**      | Production, Distributed     | ✅          | High        | Excellent   | ✅                    |
| **PostgreSQL** | Enterprise, Complex Queries | ✅          | High        | Good        | ✅                    |
| **Custom**     | Specialized Requirements    | ✅          | Custom      | Custom      | ✅                    |

## 🚀 Quick Start

Choose your backend based on your requirements:

- **Development**: Start with Memory for rapid prototyping
- **Simple Applications**: Use File for straightforward persistence
- **Production**: Choose Redis for high performance or PostgreSQL for complex data relationships
- **Enterprise**: Implement Custom backend for specialized requirements

---

## 💾 Memory Backend

**Best for**: Development, testing, and applications where persistence is not required.

### Features

- ⚡ Fastest performance
- 🔄 No I/O operations
- ⚠️ Data lost on application restart
- 🚫 Single-process only

### Basic Usage

```typescript
import { QueueManager } from 'queue-manager';

const queue = QueueManager.getInstance({
  backend: { type: 'memory' },
});
```

### When to Use

- ✅ Unit testing
- ✅ Development environments
- ✅ Temporary task processing
- ❌ Production environments
- ❌ Data persistence requirements

---

## 📁 File Backend

**Best for**: Small applications, prototyping, and simple persistence needs.

### Features

- 💾 JSON-based persistence
- 🔒 Atomic write operations
- 📝 Human-readable storage format
- 🚫 Single-process only

### Basic Usage

```typescript
import { QueueManager } from 'queue-manager';

const queue = QueueManager.getInstance({
  backend: {
    type: 'file',
    filePath: './data/queue.json',
  },
});
```

### Configuration Options

| Option     | Type     | Description                   | Default      |
| ---------- | -------- | ----------------------------- | ------------ |
| `filePath` | `string` | Path to the JSON storage file | **Required** |

### Best Practices

```typescript
// Ensure directory exists before initialization
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const filePath = './data/queue.json';
mkdirSync(dirname(filePath), { recursive: true });

const queue = QueueManager.getInstance({
  backend: { type: 'file', filePath },
});
```

### When to Use

- ✅ Simple applications
- ✅ Local development
- ✅ Audit trails needed
- ❌ High-throughput scenarios
- ❌ Multi-process environments

---

## 🐘 PostgreSQL Backend

**Best for**: Enterprise applications, complex queries, and robust data persistence.

### Features

- 🔐 ACID compliance
- 📊 Rich querying capabilities
- 🏢 Enterprise-grade reliability
- 🔄 Multi-process support
- 📈 Horizontal scaling

### Basic Usage

```typescript
import { QueueManager } from 'queue-manager';
import { Pool } from 'pg';

const pgPool = new Pool({
  connectionString: 'postgresql://user:password@localhost:5432/mydb',
});

const queue = QueueManager.getInstance({
  backend: {
    type: 'postgres',
    pg: pgPool,
  },
});
```

### Advanced Configuration

```typescript
const queue = QueueManager.getInstance({
  backend: {
    type: 'postgres',
    pg: pgPool,
    options: {
      tableName: 'task_queue',
      schema: 'public',
      useMigrate: true,
    },
  },
});
```

### Configuration Options

| Option      | Type      | Description                | Default       |
| ----------- | --------- | -------------------------- | ------------- |
| `pg`        | `pg.Pool` | PostgreSQL connection pool | **Required**  |
| `tableName` | `string`  | Custom table name          | `queue_tasks` |
| `schema`    | `string`  | Database schema            | `public`      |

### Database Migration

```typescript
// Initialize the database table
await queue.runMigration();
```

The migration creates a table accordion backend.options

### Connection Pool Best Practices

```typescript
import { Pool } from 'pg';

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle clients after 30s
  connectionTimeoutMillis: 2000, // Timeout after 2s
});

// Graceful shutdown
process.on('SIGINT', () => {
  pgPool.end();
});
```

### When to Use

- ✅ Production applications
- ✅ Complex data relationships
- ✅ Transaction requirements
- ✅ Advanced querying needs
- ✅ Multi-process environments

---

## 🔴 Redis Backend

**Best for**: High-performance applications, distributed systems, and real-time processing.

### Features

- 🚀 Sub-millisecond latency
- 🔄 Multi-process support
- 📡 Distributed architecture
- 🔒 Atomic operations
- 🏃‍♂️ Built-in locking mechanisms

### Basic Usage

```typescript
import { QueueManager } from 'queue-manager';
import Redis from 'ioredis';

const redisClient = new Redis({
  host: 'localhost',
  port: 6379,
});

const queue = QueueManager.getInstance({
  backend: {
    type: 'redis',
    redisClient,
  },
});
```

### Advanced Configuration

```typescript
const queue = QueueManager.getInstance({
  backend: {
    type: 'redis',
    redisClient,
    options: {
      storageName: 'my-application-queue',
    },
  },
});
```

### Configuration Options

| Option        | Type     | Description                     | Default         |
| ------------- | -------- | ------------------------------- | --------------- |
| `redisClient` | `Redis`  | ioredis client instance         | **Required**    |
| `storageName` | `string` | Redis key prefix for queue data | `queue-storage` |

<!-- ### Redis Cluster Support

```typescript
import Redis from 'ioredis';

const redisCluster = new Redis.Cluster([
  { host: 'redis-node-1', port: 6379 },
  { host: 'redis-node-2', port: 6379 },
  { host: 'redis-node-3', port: 6379 },
]);

const queue = QueueManager.getInstance({
  backend: {
    type: 'redis',
    redisClient: redisCluster,
  },
});
``` -->

### Connection Management

```typescript
// With connection retry logic
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Handle connection events
redisClient.on('connect', () => console.log('Redis connected'));
redisClient.on('error', err => console.error('Redis error:', err));

// Graceful shutdown
process.on('SIGINT', () => {
  redisClient.disconnect();
});
```

### Multi-Process Configuration

When running multiple queue workers:

```typescript
const queue = QueueManager.getInstance({
  backend: {
    type: 'redis',
    redisClient,
    options: {
      storageName: 'production-queue',
    },
  },
});
```

### Version Compatibility Note

> ⚠️ **Important**: From version v1.0.16 in redis - there is no longer usage on `useLockKey` due to
> each process is fully atomic and can run in multi process safely

```typescript
// For versions < 1.0.13
const queue = QueueManager.getInstance({
  backend: {
    type: 'redis',
    redisClient,
    storageName: 'my-queue', // Direct property
  },
});
```

### When to Use

- ✅ High-performance requirements
- ✅ Distributed systems
- ✅ Real-time processing
- ✅ Multi-process environments
- ✅ Caching layer integration

---

## 🛠️ Custom Backend

**Best for**: Specialized requirements, existing infrastructure integration, and advanced use cases.

### Features

- 🎯 Complete control over storage logic
- 🔧 Integration with existing systems
- ⚡ Optimized for specific use cases
- 🏗️ Custom data structures and indexes

### Implementation Requirements

Your custom repository must implement the following interface:

```typescript
interface QueueRepositoryInterface {
  loadTasks(): Promise<Task[]>;
  saveTasks(tasks: Task[]): Promise<Task[]>;
  dequeue(): Promise<Task | null>;
  loadTasks(status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]>;
  saveTasks(
    tasks: Task<HandlerMap>[],
    status?: Task<HandlerMap>['status']
  ): Promise<Task<HandlerMap>[]>;
  dequeue(): Promise<Task<HandlerMap> | null>;
  enqueue(task: Task<HandlerMap>): Promise<void>;
  updateTask(id: string, obj: Partial<Task<HandlerMap>>): Promise<Task<HandlerMap> | undefined>;
  deleteTask(id: string, hardDelete?: boolean): Promise<Task<HandlerMap> | undefined>;
}
```

### Basic Example

```typescript
import { CustomQueueRepository, QueueManager } from 'queue-manager';

const customRepo = new CustomQueueRepository({
  loadTasks: async () => {
    // Your implementation to load all tasks
    return await yourStorageSystem.getAllTasks();
  },

  saveTasks: async tasks => {
    // Your implementation to save tasks
    return await yourStorageSystem.saveTasks(tasks);
  },

  dequeue: async () => {
    // Your atomic dequeue implementation
    return await yourStorageSystem.getNextPendingTask();
  },
});

const queue = QueueManager.getInstance({
  backend: {
    type: 'custom',
    repository: customRepo,
  },
});
```

### Key Implementation Considerations

1. **Atomic Operations**: Ensure `dequeue()` is atomic to prevent race conditions
2. **Error Handling**: Implement proper error handling and recovery
3. **Performance**: Optimize for your specific access patterns
4. **Consistency**: Maintain data consistency across operations

### When to Use

- ✅ Integration with existing databases
- ✅ Specialized performance requirements
- ✅ Custom data structures needed
- ✅ Legacy system integration
- ✅ Advanced querying capabilities

<!-- For detailed custom implementation examples, see our
[Custom Repository Guide](./customRepository.md). -->

---

## 🔧 Choosing the Right Backend

### Decision Matrix

| Requirement           | Memory     | File     | PostgreSQL | Redis      | Custom     |
| --------------------- | ---------- | -------- | ---------- | ---------- | ---------- |
| **Development Speed** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐     | ⭐⭐⭐     | ⭐⭐       |
| **Production Ready**  | ❌         | ⭐⭐     | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Performance**       | ⭐⭐⭐⭐⭐ | ⭐⭐     | ⭐⭐⭐     | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Scalability**       | ❌         | ❌       | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Multi-Process**     | ❌         | ❌       | ✅         | ✅         | ✅         |
| **Setup Complexity**  | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐       | ⭐⭐⭐     | ⭐         |

### Recommended Patterns

```typescript
// Development/Testing
const devQueue = QueueManager.getInstance({
  backend: { type: 'memory' },
});

// Small Applications
const smallAppQueue = QueueManager.getInstance({
  backend: { type: 'file', filePath: './queue.json' },
});

// Production Web Applications
const webAppQueue = QueueManager.getInstance({
  backend: {
    type: 'redis',
    redisClient: new Redis(process.env.REDIS_URL),
  },
});

// Enterprise Applications
const enterpriseQueue = QueueManager.getInstance({
  backend: {
    type: 'postgres',
    pg: pgPool,
    options: { useMigrate: true },
  },
});
```

<!-- --- -->

<!-- ## 📚 Additional Resources

- [Handler Registry Guide](./handlerRegister.md)
- [Custom Repository Implementation](./customRepository.md)
- [API Documentation](../README.md)
- [Performance Optimization Tips](../docs/performance.md) -->

---

_Need help choosing? Start with Memory for development ,if your queue is managed by small amount of
task you can consider File .For production use Redis unless you need complex queries (PostgreSQL) or
have specific integration requirements (Custom)._
