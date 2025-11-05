/**
 * 日志工具
 *
 * 提供统一的日志记录功能（已集成错误脱敏机制）
 */

import { errorSanitizer } from '@/lib/security/error-sanitizer';

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
   * Error 日志（已集成错误脱敏）
   */
  error(message: string, error?: Error, options?: Omit<LogOptions, 'level'>) {
    if (error) {
      // 使用错误脱敏器安全记录错误
      const safeError = errorSanitizer.sanitize(error);

      const errorInfo = {
        ...options?.metadata,
        errorId: safeError.code,
        errorCategory: safeError.category,
        errorMessage: safeError.message,
        // 仅在开发环境记录原始错误和堆栈（限制前5行）
        ...(process.env.NODE_ENV === 'development' && {
          _debug: {
            originalMessage: error.message,
            stack: error.stack?.split('\n').slice(0, 5),
          },
        }),
      };

      console.error(
        this.format('error', message, { ...options, metadata: errorInfo })
      );
    } else {
      // 没有错误对象时，直接记录消息
      console.error(
        this.format('error', message, options)
      );
    }
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
