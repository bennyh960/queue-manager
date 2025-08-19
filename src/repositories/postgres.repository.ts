import type { HandlerMap, QueueBackendConfig, QueueRepository, Task } from '../index.js';
import { BaseQueueRepository } from './base.repository.js';

type PostgresBackendConfig = Extract<QueueBackendConfig, { type: 'postgres' }>;
export class PostgresQueueRepository extends BaseQueueRepository implements QueueRepository {
  schema: string;
  tableName: string;

  constructor(
    private readonly pg: PostgresBackendConfig['pg'],
    maxRetries: number,
    maxProcessingTime: number,
    private readonly options: PostgresBackendConfig['options'] = {}
  ) {
    super(maxRetries, maxProcessingTime);
    this.schema = options.schema || 'public';
    this.tableName = options.tableName || 'tasks';
  }
  override async loadTasks(status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    const query = status
      ? `SELECT * FROM "${this.schema}"."${this.tableName}" WHERE status = $1`
      : `SELECT * FROM "${this.schema}"."${this.tableName}"`;
    const res = await this.pg.query(query, status ? [status] : []);
    return res.rows.map(row => ({
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }));
  }

  async deleteTask(id: string, hardDelete?: boolean): Promise<Task<HandlerMap> | undefined> {
    const query = hardDelete
      ? `DELETE FROM "${this.schema}"."${this.tableName}" WHERE id = $1 RETURNING *`
      : `UPDATE "${this.schema}"."${this.tableName}" SET status = 'deleted' WHERE id = $1 RETURNING *`;
    const res = await this.pg.query(query, [id]);
    return res.rows[0] ? this.snakeToCamelObject(res.rows[0]) : undefined;
  }

  override saveTasks(tasks: Task<HandlerMap>[], status?: Task<HandlerMap>['status']): Promise<Task<HandlerMap>[]> {
    throw new Error('Method not implemented.');
  }

  private snakeToCamelObject(obj: Record<string, any>) {
    const toCamel = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

    const result: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[toCamel(key)] = obj[key];
      }
    }
    return result as Task<HandlerMap>;
  }

  private toSnake(str: string) {
    return str.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
  }

  override async enqueue(task: Task<HandlerMap>): Promise<void> {
    await this.pg.query(
      `INSERT INTO "${this.schema}"."${this.tableName}"
      (id, status, handler, payload, log, created_at, updated_at, max_retries, max_processing_time, retry_count, priority)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        task.id,
        task.status,
        task.handler,
        JSON.stringify(task.payload),
        task.log || '',
        task.createdAt,
        task.updatedAt,
        task.maxRetries,
        task.maxProcessingTime,
        task.retryCount,
        task.priority,
      ]
    );
  }

  override async updateTask(id: string, obj: Partial<Task<HandlerMap>>): Promise<Task<HandlerMap> | undefined> {
    const entries = Object.entries(obj);
    if (entries.length === 0) return; // Nothing to update

    // Build SET clause and values array
    const setClauses = entries.map(([field], idx) => `"${this.toSnake(field)}" = $${idx + 1}`);
    const values = entries.map(([, value]) => value);

    // Add id as the last parameter
    values.push(id);

    const query = `
      UPDATE "${this.schema}"."${this.tableName}"
      SET ${setClauses.join(', ')}
      WHERE id = $${values.length}
      RETURNING *;
    `;

    const res = await this.pg.query(query, values);
    return this.snakeToCamelObject(res.rows[0]);
  }

  override async dequeue(): Promise<Task<HandlerMap> | null> {
    const client = await this.pg.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `SELECT * FROM "${this.schema}"."${this.tableName}"
       WHERE status = 'pending'
       ORDER BY priority DESC, created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
      );

      if (res.rows.length === 0) {
        await client.query('COMMIT');
        const processingFrozenTasks = await this.pg.query<Task<HandlerMap>>(
          `SELECT * FROM "${this.schema}"."${this.tableName}" WHERE status = 'processing'`
        );
        await this.checkAndHandleStuckTasks(processingFrozenTasks.rows.map(this.snakeToCamelObject));
        return null;
      }

      const task = res.rows[0];

      await client.query(
        `UPDATE "${this.schema}"."${this.tableName}"
       SET status = 'processing', updated_at = NOW()
       WHERE id = $1`,
        [task.id]
      );

      await client.query('COMMIT');

      const camelCaseTask = this.snakeToCamelObject(task);

      return {
        ...camelCaseTask,
        payload: typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release(); // Return the client to the pool
    }
  }
}

// postgres migration:

const defaultColumns: Record<string, string> = {
  id: 'VARCHAR PRIMARY KEY',
  status: 'VARCHAR NOT NULL',
  handler: 'VARCHAR NOT NULL',
  payload: 'JSONB',
  log: 'TEXT',
  created_at: 'TIMESTAMP NOT NULL',
  updated_at: 'TIMESTAMP NOT NULL',
  max_retries: 'INT NOT NULL',
  max_processing_time: 'INT NOT NULL',
  retry_count: 'INT NOT NULL',
  priority: 'INT NOT NULL',
};

export async function migrateTasksTable(pg: PostgresBackendConfig['pg'], options: PostgresBackendConfig['options'] = {}): Promise<void> {
  const schema = options.schema || 'public';
  const tableName = options.tableName || 'tasks';

  // Merge default columns with custom names
  const columns = Object.entries(defaultColumns).map(([key, type]) => {
    return `"${key}" ${type}`;
  });

  // Additional constraints
  const constraints: string[] = [];

  // Build CREATE TABLE statement
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS "${schema}"."${tableName}" (
      ${columns.join(',\n      ')}
      ${constraints.length ? ',\n      ' + constraints.join(',\n      ') : ''}
    );
  `;

  // Additional indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_status_priority ON "${schema}"."${tableName}" (status, priority DESC, created_at ASC);`,
    `CREATE INDEX IF NOT EXISTS idx_status ON "${schema}"."${tableName}" (status);`,
  ];

  // Execute migration
  await pg.query(`CREATE SCHEMA IF NOT EXISTS "${schema}";`);
  await pg.query(createTableSQL);
  for (const idxSQL of indexes) {
    await pg.query(idxSQL);
  }
}
