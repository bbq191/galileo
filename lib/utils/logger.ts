/**
 * 日志工具
 *
 * 提供统一的日志记录功能
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogOptions {
  level?: LogLevel;
  context?: string;
  metadata?: Record<string, any>;
}

class Logger {
  private context: string;

  constructor(context: string = 'App') {
    this.context = context;
  }

  /**
   * 格式化日志消息
   */
  private format(level: LogLevel, message: string, options?: LogOptions): string {
    const timestamp = new Date().toISOString();
    const ctx = options?.context || this.context;
    const meta = options?.metadata
      ? ` ${JSON.stringify(options.metadata)}`
      : '';

    return `[${timestamp}] [${level.toUpperCase()}] [${ctx}] ${message}${meta}`;
  }

  /**
   * Debug 日志
   */
  debug(message: string, options?: Omit<LogOptions, 'level'>) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this.format('debug', message, options));
    }
  }

  /**
   * Info 日志
   */
  info(message: string, options?: Omit<LogOptions, 'level'>) {
    console.info(this.format('info', message, options));
  }

  /**
   * Warning 日志
   */
  warn(message: string, options?: Omit<LogOptions, 'level'>) {
    console.warn(this.format('warn', message, options));
  }

  /**
   * Error 日志
   */
  error(message: string, error?: Error, options?: Omit<LogOptions, 'level'>) {
    const errorInfo = error
      ? {
          ...options?.metadata,
          error: {
            message: error.message,
            stack: error.stack,
          },
        }
      : options?.metadata;

    console.error(
      this.format('error', message, { ...options, metadata: errorInfo })
    );
  }
}

/**
 * 创建 Logger 实例
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

/**
 * 默认 Logger 实例
 */
export const logger = new Logger();

export default logger;
