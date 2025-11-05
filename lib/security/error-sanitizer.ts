/**
 * 错误脱敏工具
 *
 * 提供安全的错误信息处理，防止敏感信息泄露
 */

/**
 * 错误类型分类
 */
export enum ErrorCategory {
  // 客户端错误 (4xx)
  VALIDATION = 'VALIDATION',           // 输入验证错误
  AUTHENTICATION = 'AUTHENTICATION',   // 认证错误
  AUTHORIZATION = 'AUTHORIZATION',     // 授权错误
  NOT_FOUND = 'NOT_FOUND',            // 资源不存在
  CONFLICT = 'CONFLICT',              // 资源冲突
  RATE_LIMIT = 'RATE_LIMIT',          // 速率限制

  // 服务器错误 (5xx)
  DATABASE = 'DATABASE',               // 数据库错误
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE', // 外部服务错误
  AI_SERVICE = 'AI_SERVICE',          // AI 服务错误
  INTERNAL = 'INTERNAL',              // 内部服务器错误
  TIMEOUT = 'TIMEOUT',                // 超时错误
}

/**
 * 安全错误接口
 */
export interface SafeError {
  code: string;
  message: string;
  category: ErrorCategory;
  statusCode: number;
  timestamp: string;
  requestId?: string;
}

/**
 * 敏感信息模式匹配
 */
const SENSITIVE_PATTERNS = [
  // 文件路径
  /[A-Z]:\\[\w\\-_\.]+/gi,              // Windows 路径
  /\/[\w\/\-_\.]+\.(ts|js|tsx|jsx)/gi,  // Unix 文件路径

  // 数据库信息
  /host[:=]\s*['"]?[\w\.\-]+['"]?/gi,
  /port[:=]\s*\d+/gi,
  /database[:=]\s*['"]?\w+['"]?/gi,
  /user[:=]\s*['"]?\w+['"]?/gi,
  /password[:=]\s*['"]?[^'"]+['"]?/gi,

  // 密钥和令牌
  /api[_-]?key[:=]\s*['"]?[\w\-]+['"]?/gi,
  /token[:=]\s*['"]?[\w\.\-]+['"]?/gi,
  /secret[:=]\s*['"]?[\w\-]+['"]?/gi,

  // 堆栈跟踪
  /at\s+[\w\.]+\s+\([^\)]+\)/gi,
  /^\s+at\s+.+$/gm,

  // IP 地址和端口
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?/g,
];

/**
 * 错误消息映射表
 */
const ERROR_MESSAGES: Record<string, { category: ErrorCategory; message: string; statusCode: number }> = {
  // 数据库错误
  'Access denied': {
    category: ErrorCategory.DATABASE,
    message: '数据库访问权限不足',
    statusCode: 500,
  },
  'Connection refused': {
    category: ErrorCategory.DATABASE,
    message: '无法连接到数据库服务',
    statusCode: 503,
  },
  'Too many connections': {
    category: ErrorCategory.DATABASE,
    message: '数据库连接数已满，请稍后重试',
    statusCode: 503,
  },
  "doesn't exist": {
    category: ErrorCategory.DATABASE,
    message: '请求的数据资源不存在',
    statusCode: 404,
  },
  'Unknown column': {
    category: ErrorCategory.DATABASE,
    message: '查询包含无效的数据字段',
    statusCode: 400,
  },
  'Unknown table': {
    category: ErrorCategory.DATABASE,
    message: '查询的数据表不存在',
    statusCode: 404,
  },
  'Syntax error': {
    category: ErrorCategory.DATABASE,
    message: '查询语句格式错误',
    statusCode: 400,
  },
  'Deadlock': {
    category: ErrorCategory.DATABASE,
    message: '数据操作发生冲突，请重试',
    statusCode: 409,
  },
  'Lock wait timeout': {
    category: ErrorCategory.DATABASE,
    message: '数据操作等待超时，请重试',
    statusCode: 408,
  },

  // 超时错误
  'timeout': {
    category: ErrorCategory.TIMEOUT,
    message: '请求处理超时，请稍后重试',
    statusCode: 504,
  },
  'timed out': {
    category: ErrorCategory.TIMEOUT,
    message: '操作超时，请优化查询条件或稍后重试',
    statusCode: 504,
  },

  // AI 服务错误
  'rate limit': {
    category: ErrorCategory.AI_SERVICE,
    message: 'AI 服务请求频率受限，请稍后重试',
    statusCode: 429,
  },
  'model not found': {
    category: ErrorCategory.AI_SERVICE,
    message: 'AI 模型服务暂时不可用',
    statusCode: 503,
  },
  'quota exceeded': {
    category: ErrorCategory.AI_SERVICE,
    message: 'AI 服务配额已用完',
    statusCode: 429,
  },

  // 验证错误
  'validation failed': {
    category: ErrorCategory.VALIDATION,
    message: '输入数据验证失败',
    statusCode: 422,
  },
  'invalid input': {
    category: ErrorCategory.VALIDATION,
    message: '输入数据格式无效',
    statusCode: 400,
  },

  // 认证授权错误
  'unauthorized': {
    category: ErrorCategory.AUTHENTICATION,
    message: '未授权访问',
    statusCode: 401,
  },
  'forbidden': {
    category: ErrorCategory.AUTHORIZATION,
    message: '没有访问权限',
    statusCode: 403,
  },

  // 资源错误
  'not found': {
    category: ErrorCategory.NOT_FOUND,
    message: '请求的资源不存在',
    statusCode: 404,
  },
  'already exists': {
    category: ErrorCategory.CONFLICT,
    message: '资源已存在',
    statusCode: 409,
  },
};

/**
 * 错误脱敏器类
 */
export class ErrorSanitizer {
  private isDevelopment: boolean;
  private includeErrorId: boolean;

  constructor(options?: { isDevelopment?: boolean; includeErrorId?: boolean }) {
    this.isDevelopment = options?.isDevelopment ?? process.env.NODE_ENV === 'development';
    this.includeErrorId = options?.includeErrorId ?? true;
  }

  /**
   * 清理敏感信息
   */
  private sanitizeMessage(message: string): string {
    let sanitized = message;

    // 移除所有敏感信息模式
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    return sanitized;
  }

  /**
   * 匹配错误类型
   */
  private matchErrorType(error: Error | string): { category: ErrorCategory; message: string; statusCode: number } | null {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const lowerMessage = errorMessage.toLowerCase();

    // 尝试精确匹配
    for (const [pattern, config] of Object.entries(ERROR_MESSAGES)) {
      if (lowerMessage.includes(pattern.toLowerCase())) {
        return config;
      }
    }

    return null;
  }

  /**
   * 生成错误 ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 脱敏错误对象
   */
  public sanitize(
    error: Error | string,
    options?: {
      category?: ErrorCategory;
      statusCode?: number;
      requestId?: string;
      includeOriginal?: boolean;
    }
  ): SafeError {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const errorId = this.generateErrorId();

    // 尝试匹配已知错误类型
    const matched = this.matchErrorType(errorObj);

    // 确定错误类别和状态码
    const category = options?.category ?? matched?.category ?? ErrorCategory.INTERNAL;
    const statusCode = options?.statusCode ?? matched?.statusCode ?? 500;

    // 构建安全消息
    let safeMessage: string;
    if (matched) {
      // 使用预定义的友好消息
      safeMessage = matched.message;
    } else if (category === ErrorCategory.VALIDATION || category === ErrorCategory.NOT_FOUND) {
      // 客户端错误，可以包含部分原始信息（已脱敏）
      safeMessage = this.sanitizeMessage(errorObj.message);
    } else {
      // 服务器错误，使用通用消息
      safeMessage = this.getGenericMessage(category);
    }

    // 构建安全错误对象
    const safeError: SafeError = {
      code: errorId,
      message: safeMessage,
      category,
      statusCode,
      timestamp: new Date().toISOString(),
      ...(options?.requestId && { requestId: options.requestId }),
    };

    // 在开发环境且明确要求时，附加原始错误信息（仅用于开发调试）
    if (this.isDevelopment && options?.includeOriginal) {
      (safeError as any)._debug = {
        originalMessage: errorObj.message,
        stack: errorObj.stack?.split('\n').slice(0, 5), // 仅保留前5行堆栈
      };
    }

    return safeError;
  }

  /**
   * 获取通用错误消息
   */
  private getGenericMessage(category: ErrorCategory): string {
    const messages: Record<ErrorCategory, string> = {
      [ErrorCategory.VALIDATION]: '输入数据验证失败',
      [ErrorCategory.AUTHENTICATION]: '身份验证失败',
      [ErrorCategory.AUTHORIZATION]: '权限不足',
      [ErrorCategory.NOT_FOUND]: '请求的资源不存在',
      [ErrorCategory.CONFLICT]: '资源冲突',
      [ErrorCategory.RATE_LIMIT]: '请求频率过高，请稍后重试',
      [ErrorCategory.DATABASE]: '数据处理失败',
      [ErrorCategory.EXTERNAL_SERVICE]: '外部服务暂时不可用',
      [ErrorCategory.AI_SERVICE]: 'AI 服务处理失败',
      [ErrorCategory.INTERNAL]: '服务器内部错误',
      [ErrorCategory.TIMEOUT]: '请求处理超时',
    };

    return messages[category] || '服务器错误，请稍后重试';
  }

  /**
   * 记录错误到日志（安全方式）
   */
  public logError(
    error: Error | string,
    context: string,
    metadata?: Record<string, any>
  ): void {
    const errorObj = typeof error === 'string' ? new Error(error) : error;
    const safeError = this.sanitize(errorObj);

    // 生产环境：仅记录脱敏后的信息
    const logData: any = {
      context,
      errorId: safeError.code,
      category: safeError.category,
      message: safeError.message,
      timestamp: safeError.timestamp,
      ...metadata,
    };

    // 开发环境：记录完整信息用于调试
    if (this.isDevelopment) {
      logData.originalError = {
        message: errorObj.message,
        stack: errorObj.stack,
      };
    }

    console.error('[ErrorSanitizer]', JSON.stringify(logData, null, 2));
  }

  /**
   * 批量脱敏错误数组
   */
  public sanitizeBatch(errors: Array<Error | string>): SafeError[] {
    return errors.map(error => this.sanitize(error));
  }

  /**
   * 检查消息是否包含敏感信息
   */
  public hasSensitiveInfo(message: string): boolean {
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
  }
}

/**
 * 默认脱敏器实例
 */
export const errorSanitizer = new ErrorSanitizer();

/**
 * 快捷函数：脱敏单个错误
 */
export function sanitizeError(
  error: Error | string,
  options?: {
    category?: ErrorCategory;
    statusCode?: number;
    requestId?: string;
  }
): SafeError {
  return errorSanitizer.sanitize(error, options);
}

/**
 * 快捷函数：安全记录错误
 */
export function logSafeError(
  error: Error | string,
  context: string,
  metadata?: Record<string, any>
): void {
  errorSanitizer.logError(error, context, metadata);
}
