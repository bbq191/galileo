/**
 * 日志工具配置
 * 提供统一的日志记录功能，支持开发和生产环境
 * @author xusy
 */
import pino from 'pino';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const isDev = process.env.NODE_ENV === 'development';
const logDir = process.env.LOG_DIR || join(process.cwd(), 'logs');

/**
 * 确保日志目录存在
 *
 * 日志目录在运行时确定（LOG_DIR），turbopackIgnore 避免构建时的文件追踪把整个项目当作依赖打包
 */
function ensureLogDir(): void {
  if (!existsSync(/*turbopackIgnore: true*/ logDir)) {
    mkdirSync(/*turbopackIgnore: true*/ logDir, { recursive: true });
  }
}

/**
 * 创建日志配置
 */
function createLoggerConfig() {
  const baseConfig = {
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // 禁用 transport，避免在 Next.js 环境中的 worker 线程问题
  // 使用简单的 JSON 输出格式
  return baseConfig;
}

/**
 * 创建生产环境日志输出目标
 * 注意：为避免 Next.js 环境中的 worker 线程问题，使用同步模式
 */
function createProductionDestination(filename: string) {
  if (isDev) {
    return undefined;
  }

  ensureLogDir();

  return pino.destination({
    dest: join(/*turbopackIgnore: true*/ logDir, filename),
    sync: true, // 使用同步模式，避免 worker 线程问题
    mkdir: true,
  });
}

/**
 * 主日志记录器
 * 用于记录所有级别的日志
 */
export const logger = pino(
  createLoggerConfig(),
  createProductionDestination('app.log')
);

/**
 * 错误日志记录器
 * 仅记录错误级别的日志，同步写入确保不丢失
 */
export const errorLogger = !isDev
  ? pino(
      { level: 'error' },
      pino.destination({
        dest: join(logDir, 'error.log'),
        sync: true, // 错误日志同步写入
        mkdir: true,
      })
    )
  : logger;

/**
 * 创建带上下文的日志记录器
 * @param context 上下文信息
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * 记录请求日志的辅助函数
 * @param method HTTP方法
 * @param path 请求路径
 * @param statusCode 响应状态码
 * @param duration 请求耗时（毫秒）
 */
export function logRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number
): void {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger[level]({
    type: 'request',
    method,
    path,
    statusCode,
    duration,
  }, `${method} ${path} ${statusCode} - ${duration}ms`);
}

/**
 * 记录错误日志的辅助函数
 * @param error 错误对象
 * @param context 额外的上下文信息
 */
export function logError(error: Error, context?: Record<string, unknown>): void {
  errorLogger.error({
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...context,
  }, error.message);
}
