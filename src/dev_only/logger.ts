import type { LoggerLike } from '../types/index.js';
import { appendFileSync } from 'fs';

const COLORS = {
  reset: '\x1b[0m',
  error: '\x1b[31m', // Red
  warn: '\x1b[33m', // Yellow
  info: '\x1b[36m', // Cyan
  debug: '\x1b[90m', // Gray
};

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export class DefaultLogger implements LoggerLike {
  private readonly level: LogLevel;
  private readonly path?: string;

  constructor(options?: { level?: LogLevel; path?: string }) {
    this.level = options?.level || 'info';
    this.path = options?.path;
    if (options?.path) {
      console.log(`Saving log to ${this.path}`);
    }
  }

  private shouldLog(method: LogLevel): boolean {
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(method) <= levels.indexOf(this.level);
  }

  private saveLog(type: LogLevel, message: string, ...args: any[]) {
    if (!this.path) return;
    appendFileSync(this.path, `[${type}][${new Date().toISOString()}] ${message} ${args.join('| ')}\n`);
  }

  error(...args: any[]) {
    if (this.shouldLog('error')) {
      const [message, ...rest] = args;
      console.error(`${COLORS.error}[queue][error]`, message, COLORS.reset, ...rest);
      this.saveLog('error', message, ...rest);
    }
  }
  warn(...args: any[]) {
    if (this.shouldLog('warn')) {
      const [message, ...rest] = args;
      console.warn(`${COLORS.warn}[queue][warn]`, message, COLORS.reset, ...rest);
      this.saveLog('warn', message, ...rest);
    }
  }
  info(...args: any[]) {
    if (this.shouldLog('info')) {
      const [message, ...rest] = args;
      console.info(`${COLORS.info}[queue][info]`, message, COLORS.reset, ...rest);
      this.saveLog('info', message, ...rest);
    }
  }
  debug(...args: any[]) {
    if (this.shouldLog('debug')) {
      const [message, ...rest] = args;
      console.debug(`${COLORS.debug}[queue][debug]`, message, COLORS.reset, ...rest);
      this.saveLog('debug', message, ...rest);
    }
  }
}
