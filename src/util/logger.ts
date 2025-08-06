import type { LoggerLike } from '../types/index.js';

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

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  private shouldLog(method: LogLevel): boolean {
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    return levels.indexOf(method) <= levels.indexOf(this.level);
  }

  error(...args: any[]) {
    if (this.shouldLog('error')) {
      const [message, ...rest] = args;
      console.error(`${COLORS.error}[queue][error]`, message, COLORS.reset, ...rest);
    }
  }
  warn(...args: any[]) {
    if (this.shouldLog('warn')) {
      const [message, ...rest] = args;
      console.warn(`${COLORS.warn}[queue][warn]`, message, COLORS.reset, ...rest);
    }
  }
  info(...args: any[]) {
    if (this.shouldLog('info')) {
      const [message, ...rest] = args;
      console.info(`${COLORS.info}[queue][info]`, message, COLORS.reset, ...rest);
    }
  }
  debug(...args: any[]) {
    if (this.shouldLog('debug')) {
      const [message, ...rest] = args;
      console.debug(`${COLORS.debug}[queue][debug]`, message, COLORS.reset, ...rest);
    }
  }
}
